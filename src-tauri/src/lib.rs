use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::CONTENT_TYPE;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

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
    let response = reqwest::get(&image_url).await.map_err(|e| e.to_string())?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit("single-instance", ());
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
            delete_profile_picture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
