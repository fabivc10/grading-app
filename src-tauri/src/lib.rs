use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::CONTENT_TYPE;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const NATIVE_OAUTH_LOGIN_PREFIX: &str = "grading-app://login";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ParsedStudentImport {
    hoja_nombre: String,
    grupo: u32,
    seccion: u32,
    cedula: String,
    nombre_completo: String,
    fecha_nacimiento: String,
    encargado_legal: String,
    telefono_encargado_legal: String,
}

fn route_oauth_deep_link_to_login(app: &AppHandle, deep_link_url: &str) {
    if !deep_link_url.starts_with(NATIVE_OAUTH_LOGIN_PREFIX) {
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(url_json) = serde_json::to_string(deep_link_url) else {
        return;
    };

    let script = format!(
        r#"
        try {{
            const deepLinkUrl = {url_json};
            window.sessionStorage.setItem("grading.pending_deep_link", deepLinkUrl);
            const target = "/login?deep_link=" + encodeURIComponent(deepLinkUrl);
            if (`${{window.location.pathname}}${{window.location.search}}` !== target) {{
                window.location.replace(target);
            }}
        }} catch (error) {{
            console.error("Failed to route deep link from Rust", error);
        }}
        "#
    );

    let _ = window.eval(&script);
}

fn sanitize_stem(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    cleaned.trim_matches('-').to_string()
}

fn icon_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("institution-icons");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

fn profile_picture_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("profile-pictures");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

fn mime_and_extension_from_data_url(data_url: &str) -> Result<(&str, &str, &str), String> {
    let (prefix, _) = data_url
        .split_once(',')
        .ok_or_else(|| "Formato de imagen invalido".to_string())?;

    if prefix.starts_with("data:image/png;base64") {
        Ok(("image/png", "png", "png"))
    } else if prefix.starts_with("data:image/jpeg;base64") {
        Ok(("image/jpeg", "jpg", "jpeg"))
    } else if prefix.starts_with("data:image/webp;base64") {
        Ok(("image/webp", "webp", "webp"))
    } else if prefix.starts_with("data:image/gif;base64") {
        Ok(("image/gif", "gif", "gif"))
    } else {
        Err("Formato de imagen no soportado".to_string())
    }
}

fn extension_from_content_type(content_type: &str) -> (&'static str, &'static str) {
    if content_type.contains("image/jpeg") {
        ("image/jpeg", "jpg")
    } else if content_type.contains("image/webp") {
        ("image/webp", "webp")
    } else if content_type.contains("image/gif") {
        ("image/gif", "gif")
    } else {
        ("image/png", "png")
    }
}

fn read_data_url(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };

    Ok(Some(format!("data:{};base64,{}", mime, STANDARD.encode(bytes))))
}

fn write_image_file(
    dir: PathBuf,
    stem: &str,
    bytes: &[u8],
    ext: &str,
    old_path: Option<String>,
) -> Result<String, String> {
    let filename = format!(
        "{}-{}.{}",
        sanitize_stem(stem).if_empty_then("image"),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis(),
        ext
    );

    let path = dir.join(filename);
    fs::write(&path, bytes).map_err(|e| e.to_string())?;

    if let Some(old) = old_path {
        let old_path = PathBuf::from(old);
        if old_path != path && old_path.exists() {
            let _ = fs::remove_file(old_path);
        }
    }

    Ok(path.to_string_lossy().to_string())
}

trait DefaultStem {
    fn if_empty_then(self, fallback: &str) -> String;
}

impl DefaultStem for String {
    fn if_empty_then(self, fallback: &str) -> String {
        if self.is_empty() { fallback.to_string() } else { self }
    }
}

#[tauri::command]
fn save_institution_icon(
    app: AppHandle,
    code: String,
    data_url: String,
    old_path: Option<String>,
) -> Result<String, String> {
    let (_, ext, _) = mime_and_extension_from_data_url(&data_url)?;
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Formato de imagen invalido".to_string())?;
    let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    write_image_file(icon_dir(&app)?, &code, &bytes, ext, old_path)
}

#[tauri::command]
fn delete_institution_icon(path: String) -> Result<(), String> {
    let file = PathBuf::from(path);
    if file.exists() {
        fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_institution_icon(path: String) -> Result<Option<String>, String> {
    read_data_url(Path::new(&path))
}

#[tauri::command]
fn save_profile_picture(
    app: AppHandle,
    user_key: String,
    data_url: String,
    old_path: Option<String>,
) -> Result<String, String> {
    let (_, ext, _) = mime_and_extension_from_data_url(&data_url)?;
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Formato de imagen invalido".to_string())?;
    let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    write_image_file(profile_picture_dir(&app)?, &user_key, &bytes, ext, old_path)
}

#[tauri::command]
async fn download_profile_picture(
    app: AppHandle,
    user_key: String,
    image_url: String,
    old_path: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&image_url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("No fue posible descargar la foto de perfil: {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_ascii_lowercase();
    let (_, ext) = extension_from_content_type(&content_type);
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    write_image_file(profile_picture_dir(&app)?, &user_key, bytes.as_ref(), ext, old_path)
}

#[tauri::command]
fn read_profile_picture(path: String) -> Result<Option<String>, String> {
    read_data_url(Path::new(&path))
}

#[tauri::command]
fn delete_profile_picture(path: String) -> Result<(), String> {
    let file = PathBuf::from(path);
    if file.exists() {
        fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn local_db_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("grading-data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn prepare_local_db_storage(app: AppHandle) -> Result<(), String> {
    let db_dir = local_db_dir(&app)?;
    let new_db = db_dir.join("grading.db");
    if new_db.exists() {
        return Ok(());
    }

    let base_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let old_db = base_dir.join("grading.db");
    if old_db.exists() {
        fs::copy(&old_db, &new_db).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn decode_data_url_to_bytes(data_url: &str) -> Result<Vec<u8>, String> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Formato de archivo invalido".to_string())?;
    STANDARD.decode(encoded).map_err(|e| e.to_string())
}

fn parse_students_excel_with_powershell(path: &Path) -> Result<Vec<ParsedStudentImport>, String> {
    println!(
        "[students/import] Iniciando parseo de Excel con PowerShell: {}",
        path.display()
    );
    let script = r#"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

$path = $env:GRADING_XLSX_PATH
if (-not $path) { throw 'No se recibio la ruta del archivo.' }

$fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Read)

function Get-EntryText($name) {
    $entry = $zip.Entries | Where-Object FullName -eq $name | Select-Object -First 1
    if (-not $entry) { return '' }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

[xml]$workbook = Get-EntryText 'xl/workbook.xml'
[xml]$rels = Get-EntryText 'xl/_rels/workbook.xml.rels'
[xml]$sharedStrings = Get-EntryText 'xl/sharedStrings.xml'

$mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
$docRelNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
$pkgRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'

$wbMgr = New-Object System.Xml.XmlNamespaceManager($workbook.NameTable)
$wbMgr.AddNamespace('x', $mainNs)
$wbMgr.AddNamespace('r', $docRelNs)

$relMgr = New-Object System.Xml.XmlNamespaceManager($rels.NameTable)
$relMgr.AddNamespace('p', $pkgRelNs)

function Get-SharedValue($index) {
    if ($null -eq $sharedStrings.sst.si) { return '' }
    $item = $sharedStrings.sst.si[[int]$index]
    if ($null -eq $item) { return '' }
    return [string]$item.InnerText
}

function Get-ColumnLetters($ref) {
    if (-not $ref) { return '' }
    return ($ref -replace '[0-9]', '')
}

function Get-CellValue($cell) {
    if ($null -eq $cell) { return '' }
    if ($cell.t -eq 's') { return (Get-SharedValue $cell.v).Trim() }
    if ($cell.t -eq 'inlineStr') { return ([string]$cell.is.InnerText).Trim() }
    return ([string]$cell.v).Trim()
}

function Normalize-Text($value) {
    if ($null -eq $value) { return '' }
    return (([string]$value) -replace '\s+', ' ').Trim()
}

function Convert-ToIsoDate($value) {
    $value = Normalize-Text $value
    if (-not $value) { return '' }

    if ($value -match '^\d+(\.\d+)?$') {
        $base = [datetime]'1899-12-30'
        return $base.AddDays([double]$value).ToString('yyyy-MM-dd')
    }

    $formats = @('dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'd-M-yyyy', 'yyyy-MM-dd')
    foreach ($format in $formats) {
        $parsed = [datetime]::MinValue
        if ([datetime]::TryParseExact($value, $format, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
            return $parsed.ToString('yyyy-MM-dd')
        }
    }

    $fallback = [datetime]::MinValue
    if ([datetime]::TryParse($value, [ref]$fallback)) {
        return $fallback.ToString('yyyy-MM-dd')
    }

    return ''
}

function Get-SheetGroup($name) {
    $match = [regex]::Match($name, '(\d{1,2})')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 0
}

function Get-SheetSection($name) {
    $match = [regex]::Match($name, '-\s*(\d{1,2})')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 1
}

$results = New-Object System.Collections.Generic.List[object]
$sheetNodes = $workbook.SelectNodes('//x:sheet', $wbMgr)

foreach ($sheet in $sheetNodes) {
    $sheetName = $sheet.GetAttribute('name')
    $group = Get-SheetGroup $sheetName
    if ($group -le 0) { continue }

    $section = Get-SheetSection $sheetName
    $relationshipId = $sheet.GetAttribute('id', $docRelNs)
    $targetNode = $rels.SelectSingleNode("//p:Relationship[@Id='$relationshipId']", $relMgr)
    if ($null -eq $targetNode) { continue }

    [xml]$worksheet = Get-EntryText ("xl/" + $targetNode.Target)
    $wsMgr = New-Object System.Xml.XmlNamespaceManager($worksheet.NameTable)
    $wsMgr.AddNamespace('x', $mainNs)

    $headerFound = $false
    $rowNodes = $worksheet.SelectNodes('//x:sheetData/x:row', $wsMgr)
    foreach ($row in $rowNodes) {
        $cells = @{}
        foreach ($cell in $row.c) {
            $col = Get-ColumnLetters $cell.r
            if ($col) {
                $cells[$col] = Get-CellValue $cell
            }
        }

        if (-not $headerFound) {
            if ((Normalize-Text $cells['B']) -eq 'Identificación' -or (Normalize-Text $cells['D']) -eq 'Fecha de Nacimiento') {
                $headerFound = $true
            }
            continue
        }

        $nombre = Normalize-Text $cells['C']
        $cedula = Normalize-Text $cells['B']
        $fechaNacimiento = Convert-ToIsoDate $cells['D']
        $encargado = Normalize-Text $cells['F']
        $telefono = Normalize-Text $cells['G']

        if (-not $nombre) { continue }

        $results.Add([PSCustomObject]@{
            hojaNombre = $sheetName
            grupo = $group
            seccion = $section
            cedula = $cedula
            nombreCompleto = $nombre
            fechaNacimiento = $fechaNacimiento
            encargadoLegal = $encargado
            telefonoEncargadoLegal = $telefono
        }) | Out-Null
    }
}

$zip.Dispose()
$fs.Dispose()
$results | ConvertTo-Json -Compress
"#;

    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
        .env("GRADING_XLSX_PATH", path.to_string_lossy().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return Err(stderr);
    }
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "No fue posible procesar el archivo de Excel.".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    serde_json::from_str::<Vec<ParsedStudentImport>>(&stdout).map_err(|e| e.to_string())
}

fn parse_students_excel_with_powershell_logged(
    path: &Path,
) -> Result<Vec<ParsedStudentImport>, String> {
    println!(
        "[students/import] Iniciando parseo de Excel con PowerShell: {}",
        path.display()
    );

    let script = r#"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

$path = $env:GRADING_XLSX_PATH
if (-not $path) { throw 'No se recibio la ruta del archivo.' }

$fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Read)

function Get-EntryText($name) {
    $entry = $zip.Entries | Where-Object FullName -eq $name | Select-Object -First 1
    if (-not $entry) { return '' }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

[xml]$workbook = Get-EntryText 'xl/workbook.xml'
[xml]$rels = Get-EntryText 'xl/_rels/workbook.xml.rels'
[xml]$sharedStrings = Get-EntryText 'xl/sharedStrings.xml'

$mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
$docRelNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
$pkgRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'

$wbMgr = New-Object System.Xml.XmlNamespaceManager($workbook.NameTable)
$wbMgr.AddNamespace('x', $mainNs)
$wbMgr.AddNamespace('r', $docRelNs)

$relMgr = New-Object System.Xml.XmlNamespaceManager($rels.NameTable)
$relMgr.AddNamespace('p', $pkgRelNs)

function Get-SharedValue($index) {
    if ($null -eq $sharedStrings.sst.si) { return '' }
    $item = $sharedStrings.sst.si[[int]$index]
    if ($null -eq $item) { return '' }
    return [string]$item.InnerText
}

function Get-ColumnLetters($ref) {
    if (-not $ref) { return '' }
    return ($ref -replace '[0-9]', '')
}

function Get-CellValue($cell) {
    if ($null -eq $cell) { return '' }
    if ($cell.t -eq 's') { return (Get-SharedValue $cell.v).Trim() }
    if ($cell.t -eq 'inlineStr') { return ([string]$cell.is.InnerText).Trim() }
    return ([string]$cell.v).Trim()
}

function Normalize-Text($value) {
    if ($null -eq $value) { return '' }
    return (([string]$value) -replace '\s+', ' ').Trim()
}

function Convert-ToIsoDate($value) {
    $value = Normalize-Text $value
    if (-not $value) { return '' }

    if ($value -match '^\d+(\.\d+)?$') {
        $base = [datetime]'1899-12-30'
        return $base.AddDays([double]$value).ToString('yyyy-MM-dd')
    }

    $formats = @('dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'd-M-yyyy', 'yyyy-MM-dd')
    foreach ($format in $formats) {
        $parsed = [datetime]::MinValue
        if ([datetime]::TryParseExact($value, $format, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
            return $parsed.ToString('yyyy-MM-dd')
        }
    }

    $fallback = [datetime]::MinValue
    if ([datetime]::TryParse($value, [ref]$fallback)) {
        return $fallback.ToString('yyyy-MM-dd')
    }

    return ''
}

function Get-SheetGroup($name) {
    $match = [regex]::Match($name, '(\d{1,2})')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 0
}

function Get-SheetSection($name) {
    $match = [regex]::Match($name, '-\s*(\d{1,2})')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 1
}

$results = New-Object System.Collections.Generic.List[object]
$sheetNodes = $workbook.SelectNodes('//x:sheet', $wbMgr)

foreach ($sheet in $sheetNodes) {
    $sheetName = $sheet.GetAttribute('name')
    $group = Get-SheetGroup $sheetName
    if ($group -le 0) { continue }

    $section = Get-SheetSection $sheetName
    $relationshipId = $sheet.GetAttribute('id', $docRelNs)
    $targetNode = $rels.SelectSingleNode("//p:Relationship[@Id='$relationshipId']", $relMgr)
    if ($null -eq $targetNode) { continue }

    [xml]$worksheet = Get-EntryText ("xl/" + $targetNode.Target)
    $wsMgr = New-Object System.Xml.XmlNamespaceManager($worksheet.NameTable)
    $wsMgr.AddNamespace('x', $mainNs)

    $headerFound = $false
    $rowNodes = $worksheet.SelectNodes('//x:sheetData/x:row', $wsMgr)
    foreach ($row in $rowNodes) {
        $cells = @{}
        foreach ($cell in $row.c) {
            $col = Get-ColumnLetters $cell.r
            if ($col) {
                $cells[$col] = Get-CellValue $cell
            }
        }

        if (-not $headerFound) {
            $headerB = (Normalize-Text $cells['B']).ToLowerInvariant()
            $headerD = (Normalize-Text $cells['D']).ToLowerInvariant()
            if ($headerB -match '^identific' -or $headerD -eq 'fecha de nacimiento') {
                $headerFound = $true
            }
            continue
        }

        $nombre = Normalize-Text $cells['C']
        $cedula = Normalize-Text $cells['B']
        $fechaNacimiento = Convert-ToIsoDate $cells['D']
        $encargado = Normalize-Text $cells['F']
        $telefono = Normalize-Text $cells['G']

        if (-not $nombre) { continue }

        $results.Add([PSCustomObject]@{
            hojaNombre = $sheetName
            grupo = $group
            seccion = $section
            cedula = $cedula
            nombreCompleto = $nombre
            fechaNacimiento = $fechaNacimiento
            encargadoLegal = $encargado
            telefonoEncargadoLegal = $telefono
        }) | Out-Null
    }
}

$zip.Dispose()
$fs.Dispose()
if ($results.Count -eq 0) {
    '[]'
} else {
    $results | ConvertTo-Json -Compress
}
"#;

    let script_path = path.with_extension("ps1");
    let mut script_bytes = vec![0xEF, 0xBB, 0xBF];
    script_bytes.extend_from_slice(script.as_bytes());
    fs::write(&script_path, script_bytes).map_err(|e| e.to_string())?;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .env("GRADING_XLSX_PATH", path.to_string_lossy().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&script_path);
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        eprintln!(
            "[students/import] PowerShell devolvio stderr para {}: {}",
            path.display(),
            stderr
        );
        return Err(stderr);
    }
    if !output.status.success() {
        eprintln!(
            "[students/import] PowerShell devolvio error para {}: {}",
            path.display(),
            stderr
        );
        return Err(if stderr.is_empty() {
            "No fue posible procesar el archivo de Excel.".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        println!(
            "[students/import] PowerShell termino sin filas importables para {} | status={}",
            path.display(),
            output.status
        );
        return Ok(Vec::new());
    }

    let rows = serde_json::from_str::<Vec<ParsedStudentImport>>(&stdout).map_err(|e| {
        eprintln!(
            "[students/import] No se pudo convertir la salida JSON para {}: {} | stdout={}",
            path.display(),
            e,
            stdout
        );
        e.to_string()
    })?;

    println!(
        "[students/import] Parseo completado para {}: {} fila(s)",
        path.display(),
        rows.len()
    );
    for (index, row) in rows.iter().enumerate().take(20) {
        println!(
            "[students/import] fila {} => hoja='{}' grupo={} seccion={} cedula='{}' nombre='{}' fecha='{}' encargado='{}' telefono='{}'",
            index + 1,
            row.hoja_nombre,
            row.grupo,
            row.seccion,
            row.cedula,
            row.nombre_completo,
            row.fecha_nacimiento,
            row.encargado_legal,
            row.telefono_encargado_legal
        );
    }
    if rows.len() > 20 {
        println!(
            "[students/import] ... {} fila(s) adicional(es) no impresas",
            rows.len() - 20
        );
    }
    Ok(rows)
}

#[tauri::command]
fn parse_students_excel(
    app: AppHandle,
    data_url: String,
    filename: Option<String>,
) -> Result<Vec<ParsedStudentImport>, String> {
    println!(
        "[students/import] Solicitud recibida desde frontend. filename={}",
        filename.clone().unwrap_or_else(|| "(sin nombre)".to_string())
    );
    let bytes = decode_data_url_to_bytes(&data_url)?;
    let temp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("excel-imports");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let stem = filename.unwrap_or_else(|| "estudiantes.xlsx".to_string());
    let temp_file = temp_dir.join(format!(
        "{}-{}.xlsx",
        sanitize_stem(&stem).if_empty_then("estudiantes"),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    ));

    println!(
        "[students/import] Guardando archivo temporal: {} ({} bytes)",
        temp_file.display(),
        bytes.len()
    );
    fs::write(&temp_file, bytes).map_err(|e| e.to_string())?;
    let result = parse_students_excel_with_powershell_logged(&temp_file);
    match &result {
        Ok(rows) => println!(
            "[students/import] Resultado final para {}: {} fila(s)",
            temp_file.display(),
            rows.len()
        ),
        Err(error) => eprintln!(
            "[students/import] Error final para {}: {}",
            temp_file.display(),
            error
        ),
    }
    let _ = fs::remove_file(&temp_file);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(deep_link_url) = args.iter().find(|value| value.starts_with(NATIVE_OAUTH_LOGIN_PREFIX)) {
                route_oauth_deep_link_to_login(app, deep_link_url);
            }
            let _ = app.emit("single-instance", SingleInstancePayload { args, cwd });
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_institution_icon,
            delete_institution_icon,
            read_institution_icon,
            save_profile_picture,
            download_profile_picture,
            read_profile_picture,
            delete_profile_picture,
            prepare_local_db_storage,
            parse_students_excel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
