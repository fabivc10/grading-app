import Database from "@tauri-apps/plugin-sql";
import { hashPassword } from "./crypto";

// ─── Singleton connection ─────────────────────────────────────────────────────
let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const db = _db ?? await Database.load("sqlite:grading.db");
        await runMigrations(db);
        _db = db;
        return db;
    })().catch((err) => {
        _initPromise = null;
        throw err;
    }).finally(() => {
        _initPromise = null; // always allow next call to re-check migrations
    });

    return _initPromise;
}

// ─── Migrations ───────────────────────────────────────────────────────────────
async function runMigrations(db: Database) {
    await db.execute("PRAGMA journal_mode = WAL;");
    await db.execute("PRAGMA foreign_keys = ON;");

    // ── schema_version tracks which migrations have run ────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS schema_version (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL DEFAULT 0
        )
    `);
    await db.execute(`INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0)`);

    const vrows = await db.select<{ version: number }[]>(
        "SELECT version FROM schema_version WHERE id = 1"
    );
    const version = vrows[0]?.version ?? 0;

    // ── v1 — all domain tables ─────────────────────────────────────────────────
    if (version < 1) {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS institutions (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT NOT NULL,
                code    TEXT NOT NULL UNIQUE,
                address TEXT
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name  TEXT NOT NULL,
                hash  TEXT NOT NULL
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS asignaturas (
                id             TEXT    PRIMARY KEY,
                institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                año            INTEGER NOT NULL,
                nombre         TEXT    NOT NULL,
                grupo          TEXT    NOT NULL,
                lecciones      INTEGER NOT NULL DEFAULT 0
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS semestres (
                id            TEXT PRIMARY KEY,
                asignatura_id TEXT NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
                nombre        TEXT NOT NULL
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS estudiantes (
                id              TEXT    PRIMARY KEY,
                institution_id  INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                nombre_completo TEXT    NOT NULL,
                cedula          TEXT,
                telefono        TEXT,
                edad            INTEGER NOT NULL DEFAULT 0,
                adecuacion      TEXT    NOT NULL DEFAULT 'no_tiene'
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS estudiante_asignaturas (
                estudiante_id TEXT NOT NULL REFERENCES estudiantes(id)  ON DELETE CASCADE,
                asignatura_id TEXT NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
                PRIMARY KEY (estudiante_id, asignatura_id)
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS horario_entries (
                id             TEXT    PRIMARY KEY,
                institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                asignatura_id  TEXT    NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
                day            INTEGER NOT NULL,
                slot           INTEGER NOT NULL,
                leccion_num    INTEGER NOT NULL DEFAULT 0
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS horario_breaks (
                id             TEXT    PRIMARY KEY,
                institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                nombre         TEXT    NOT NULL,
                start_slot     INTEGER NOT NULL,
                duration_slots INTEGER NOT NULL,
                days           TEXT    NOT NULL
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS evaluaciones (
                id             TEXT    PRIMARY KEY,
                institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                asignatura_id  TEXT    NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
                nombre         TEXT    NOT NULL
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS eval_temas (
                id            TEXT    PRIMARY KEY,
                evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                category      TEXT    NOT NULL,
                tema          TEXT    NOT NULL,
                nombre        TEXT    NOT NULL,
                descripcion   TEXT    NOT NULL DEFAULT '',
                valor         REAL    NOT NULL DEFAULT 0
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS eval_asistencia (
                id            TEXT    PRIMARY KEY,
                evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                semestre      TEXT    NOT NULL,
                semana        INTEGER NOT NULL,
                dias          TEXT    NOT NULL,
                UNIQUE (evaluacion_id, semestre, semana)
            )
        `);

        await db.execute("UPDATE schema_version SET version = 1 WHERE id = 1");
    }

    // ── v2 — default user + demo data ─────────────────────────────────────────
    if (version < 2) {
        await seedDefaultUser(db);
        await seedDemoInstitutions(db);
        await db.execute("UPDATE schema_version SET version = 2 WHERE id = 1");
    }

    // ── v3 — repair schema if DB was initialized from old SQL files ────────────
    if (version < 3) {
        // Ensure users table exists (may be missing if old SQL files were used)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name  TEXT NOT NULL,
                hash  TEXT NOT NULL
            )
        `);
        await seedDefaultUser(db);

        // Fix evaluaciones: old SQL files used estudiante_id+weights; app needs nombre
        const evalDef = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='evaluaciones'"
        );
        const evalHasNombre = (evalDef[0]?.sql ?? "").includes("nombre");
        if (!evalHasNombre) {
            await db.execute("PRAGMA foreign_keys = OFF");
            await db.execute("DROP TABLE IF EXISTS eval_asistencia");
            await db.execute("DROP TABLE IF EXISTS eval_temas");
            await db.execute("DROP TABLE IF EXISTS evaluaciones");
            await db.execute(`
                CREATE TABLE evaluaciones (
                    id             TEXT    PRIMARY KEY,
                    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                    asignatura_id  TEXT    NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
                    nombre         TEXT    NOT NULL
                )
            `);
            await db.execute(`
                CREATE TABLE eval_temas (
                    id            TEXT    PRIMARY KEY,
                    evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                    category      TEXT    NOT NULL,
                    tema          TEXT    NOT NULL,
                    nombre        TEXT    NOT NULL,
                    descripcion   TEXT    NOT NULL DEFAULT '',
                    valor         REAL    NOT NULL DEFAULT 0
                )
            `);
            await db.execute(`
                CREATE TABLE eval_asistencia (
                    id            TEXT    PRIMARY KEY,
                    evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                    semestre      TEXT    NOT NULL,
                    semana        INTEGER NOT NULL,
                    dias          TEXT    NOT NULL,
                    UNIQUE (evaluacion_id, semestre, semana)
                )
            `);
            await db.execute("PRAGMA foreign_keys = ON");
        }

        // Fix eval_asistencia: old SQL files used individual day columns (l,m,x,j,v)
        const asistDef = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='eval_asistencia'"
        );
        const asistHasDias = (asistDef[0]?.sql ?? "").includes("dias");
        if (!asistHasDias) {
            await db.execute("PRAGMA foreign_keys = OFF");
            await db.execute("DROP TABLE IF EXISTS eval_asistencia");
            await db.execute(`
                CREATE TABLE eval_asistencia (
                    id            TEXT    PRIMARY KEY,
                    evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                    semestre      TEXT    NOT NULL,
                    semana        INTEGER NOT NULL,
                    dias          TEXT    NOT NULL,
                    UNIQUE (evaluacion_id, semestre, semana)
                )
            `);
            await db.execute("PRAGMA foreign_keys = ON");
        }

        await db.execute("UPDATE schema_version SET version = 3 WHERE id = 1");
    }

    // ── v4 — add estudiante_id to evaluaciones ─────────────────────────────────
    if (version < 4) {
        const evalDef4 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='evaluaciones'"
        );
        const hasEstId = (evalDef4[0]?.sql ?? "").includes("estudiante_id");
        if (!hasEstId) {
            await db.execute("ALTER TABLE evaluaciones ADD COLUMN estudiante_id TEXT");
        }
        await db.execute("UPDATE schema_version SET version = 4 WHERE id = 1");
    }

    // ── v5 — add conducta_pct to evaluaciones ─────────────────────────────────
    if (version < 5) {
        const evalDef5 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='evaluaciones'"
        );
        const hasConductaPct = (evalDef5[0]?.sql ?? "").includes("conducta_pct");
        if (!hasConductaPct) {
            await db.execute(
                "ALTER TABLE evaluaciones ADD COLUMN conducta_pct INTEGER NOT NULL DEFAULT 100"
            );
        }
        await db.execute("UPDATE schema_version SET version = 5 WHERE id = 1");
    }

    // ── v6 — eval_entries + student-level cotidiano/conducta ──────────────────
    if (version < 6) {
        // Named evaluations within each asignatura category (tareas/prueba/proyecto)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS eval_entries (
                id            TEXT PRIMARY KEY,
                evaluacion_id TEXT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
                category      TEXT NOT NULL,
                nombre        TEXT NOT NULL,
                pct           REAL NOT NULL DEFAULT 0
            )
        `);

        // Recreate eval_temas to reference eval_entries instead of evaluaciones directly
        const temasDef6 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='eval_temas'"
        );
        const hasEntryId = (temasDef6[0]?.sql ?? "").includes("entry_id");
        if (!hasEntryId) {
            await db.execute("PRAGMA foreign_keys = OFF");
            await db.execute("DROP TABLE IF EXISTS eval_temas");
            await db.execute(`
                CREATE TABLE eval_temas (
                    id          TEXT PRIMARY KEY,
                    entry_id    TEXT NOT NULL REFERENCES eval_entries(id) ON DELETE CASCADE,
                    tema        TEXT NOT NULL,
                    nombre      TEXT NOT NULL,
                    descripcion TEXT NOT NULL DEFAULT '',
                    valor       REAL NOT NULL DEFAULT 0
                )
            `);
            await db.execute("PRAGMA foreign_keys = ON");
        }

        // Student-level: conducta % + cotidiano entries (one record per student)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS student_cotidiano (
                estudiante_id TEXT PRIMARY KEY REFERENCES estudiantes(id) ON DELETE CASCADE,
                conducta_pct  INTEGER NOT NULL DEFAULT 100
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS student_cotidiano_entries (
                id            TEXT PRIMARY KEY,
                estudiante_id TEXT NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
                nombre        TEXT NOT NULL,
                pct           REAL NOT NULL DEFAULT 0
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS student_cotidiano_items (
                id          TEXT PRIMARY KEY,
                entry_id    TEXT NOT NULL REFERENCES student_cotidiano_entries(id) ON DELETE CASCADE,
                tema        TEXT NOT NULL,
                nombre      TEXT NOT NULL,
                descripcion TEXT NOT NULL DEFAULT '',
                valor       REAL NOT NULL DEFAULT 0
            )
        `);

        await db.execute("UPDATE schema_version SET version = 6 WHERE id = 1");
    }

    // ── v7 — add nota (earned score) to eval_temas ────────────────────────────
    if (version < 7) {
        const temasDef7 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='eval_temas'"
        );
        const hasNota = (temasDef7[0]?.sql ?? "").includes("nota");
        if (!hasNota) {
            await db.execute("ALTER TABLE eval_temas ADD COLUMN nota REAL NOT NULL DEFAULT 0");
        }
        // Same for student_cotidiano_items if table exists
        const cotItemsDef = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='student_cotidiano_items'"
        );
        if (cotItemsDef.length > 0) {
            const cotHasNota = (cotItemsDef[0]?.sql ?? "").includes("nota");
            if (!cotHasNota) {
                await db.execute("ALTER TABLE student_cotidiano_items ADD COLUMN nota REAL NOT NULL DEFAULT 0");
            }
        }
        await db.execute("UPDATE schema_version SET version = 7 WHERE id = 1");
    }

    // ── v8 — asistencia_semanas + asistencia_dias ──────────────────────────────
    if (version < 8) {

        await db.execute(`
            CREATE TABLE IF NOT EXISTS asistencia_semanas (
                id            TEXT    PRIMARY KEY,
                asignatura_id TEXT    NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
                semestre      TEXT    NOT NULL,
                inicio_date   TEXT    NOT NULL,
                orden         INTEGER NOT NULL DEFAULT 0
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS asistencia_dias (
                id            TEXT PRIMARY KEY,
                semana_id     TEXT NOT NULL REFERENCES asistencia_semanas(id) ON DELETE CASCADE,
                estudiante_id TEXT NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
                l TEXT, m TEXT, x TEXT, j TEXT, v TEXT,
                UNIQUE(semana_id, estudiante_id)
            )
        `);
        await db.execute("UPDATE schema_version SET version = 8 WHERE id = 1");
    }

    // ── v9 — add seccion column to asignaturas ─────────────────────────────────
    if (version < 9) {
        const asigDef9 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='asignaturas'"
        );
        const hasSeccion = (asigDef9[0]?.sql ?? "").includes("seccion");
        if (!hasSeccion) {
            await db.execute("ALTER TABLE asignaturas ADD COLUMN seccion TEXT NOT NULL DEFAULT ''");
        }
        await db.execute("UPDATE schema_version SET version = 9 WHERE id = 1");
    }

    // ── v10 — add start_date / end_date to semestres ───────────────────────────
    if (version < 10) {
        const semDef10 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='semestres'"
        );
        const sql10 = semDef10[0]?.sql ?? "";
        if (!sql10.includes("start_date")) {
            await db.execute("ALTER TABLE semestres ADD COLUMN start_date TEXT NOT NULL DEFAULT ''");
        }
        if (!sql10.includes("end_date")) {
            await db.execute("ALTER TABLE semestres ADD COLUMN end_date TEXT NOT NULL DEFAULT ''");
        }
        await db.execute("UPDATE schema_version SET version = 10 WHERE id = 1");
    }

    // ── v11 — global settings table (per-institution key-value store) ──────────
    if (version < 11) {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                key            TEXT    NOT NULL,
                value          TEXT    NOT NULL DEFAULT '',
                PRIMARY KEY (institution_id, key)
            )
        `);
        await db.execute("UPDATE schema_version SET version = 11 WHERE id = 1");
    }

    // ── v12 — add semestre column to eval_entries ──────────────────────────────
    if (version < 12) {
        const entryDef12 = await db.select<{ sql: string }[]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='eval_entries'"
        );
        const hasSemestre = (entryDef12[0]?.sql ?? "").includes("semestre");
        if (!hasSemestre) {
            await db.execute(
                "ALTER TABLE eval_entries ADD COLUMN semestre TEXT NOT NULL DEFAULT 's1'"
            );
        }
        await db.execute("UPDATE schema_version SET version = 12 WHERE id = 1");
    }

    // ── v13 — seed demo eval entries for reports testing ──────────────────────
    if (version < 13) {
        await seedDemoEvalEntries(db);
        await db.execute("UPDATE schema_version SET version = 13 WHERE id = 1");
    }

    // ── v14 — more demo data (more asignaturas, students, eval entries) ─────────
    if (version < 14) {
        await seedMoreDemoData(db);
        await db.execute("UPDATE schema_version SET version = 14 WHERE id = 1");
    }

    // ── v15 — add nota_descripcion column to eval_temas ───────────────────────
    if (version < 15) {
        const cols = await db.select<{ name: string }[]>(
            "PRAGMA table_info(eval_temas)"
        );
        if (!cols.some((c) => c.name === "nota_descripcion")) {
            await db.execute(
                "ALTER TABLE eval_temas ADD COLUMN nota_descripcion TEXT NOT NULL DEFAULT ''"
            );
        }
        await db.execute("UPDATE schema_version SET version = 15 WHERE id = 1");
    }

    // ── v16 — add CR education fields to institutions ──────────────────────────
    if (version < 16) {
        const cols = await db.select<{ name: string }[]>("PRAGMA table_info(institutions)");
        const names = cols.map((c) => c.name);
        if (!names.includes("tipo_institucion"))
            await db.execute("ALTER TABLE institutions ADD COLUMN tipo_institucion TEXT");
        if (!names.includes("direccion_regional"))
            await db.execute("ALTER TABLE institutions ADD COLUMN direccion_regional TEXT");
        if (!names.includes("circuito"))
            await db.execute("ALTER TABLE institutions ADD COLUMN circuito TEXT");
        if (!names.includes("icon_path"))
            await db.execute("ALTER TABLE institutions ADD COLUMN icon_path TEXT");
        await db.execute("UPDATE schema_version SET version = 16 WHERE id = 1");
    }

    // ── v17–v19 columns — always check regardless of version number ──────────
    // (version-gating was unreliable if a previous broken run advanced the
    //  schema_version counter without actually applying the ALTER TABLE)
    {
        const instCols = await db.select<{ name: string }[]>("PRAGMA table_info(institutions)");
        if (!instCols.map((c) => c.name).includes("icon_path"))
            await db.execute("ALTER TABLE institutions ADD COLUMN icon_path TEXT");

        const estCols = await db.select<{ name: string }[]>("PRAGMA table_info(estudiantes)");
        const estNames = estCols.map((c) => c.name);
        if (!estNames.includes("fecha_nacimiento"))
            await db.execute("ALTER TABLE estudiantes ADD COLUMN fecha_nacimiento TEXT DEFAULT ''");
        if (!estNames.includes("telefono_estudiante"))
            await db.execute("ALTER TABLE estudiantes ADD COLUMN telefono_estudiante TEXT DEFAULT ''");
        if (!estNames.includes("tutor1_nombre"))
            await db.execute("ALTER TABLE estudiantes ADD COLUMN tutor1_nombre TEXT DEFAULT ''");
        if (!estNames.includes("tutor1_telefono")) {
            await db.execute("ALTER TABLE estudiantes ADD COLUMN tutor1_telefono TEXT DEFAULT ''");
            await db.execute("UPDATE estudiantes SET tutor1_telefono = telefono WHERE telefono IS NOT NULL AND telefono != ''");
        }
        if (!estNames.includes("tutor2_nombre"))
            await db.execute("ALTER TABLE estudiantes ADD COLUMN tutor2_nombre TEXT DEFAULT ''");
        if (!estNames.includes("tutor2_telefono"))
            await db.execute("ALTER TABLE estudiantes ADD COLUMN tutor2_telefono TEXT DEFAULT ''");

        const asigCols = await db.select<{ name: string }[]>("PRAGMA table_info(asignaturas)");
        if (!asigCols.map((c) => c.name).includes("created_at"))
            await db.execute("ALTER TABLE asignaturas ADD COLUMN created_at TEXT DEFAULT ''");

        const userCols = await db.select<{ name: string }[]>("PRAGMA table_info(users)");
        const userNames = userCols.map((c) => c.name);
        if (!userNames.includes("avatar_data"))
            await db.execute("ALTER TABLE users ADD COLUMN avatar_data TEXT");
        if (!userNames.includes("auth_provider")) {
            await db.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email'");
            await db.execute("UPDATE users SET auth_provider = 'email' WHERE auth_provider IS NULL OR auth_provider = ''");
        }
        if (!userNames.includes("external_auth_id"))
            await db.execute("ALTER TABLE users ADD COLUMN external_auth_id TEXT");

        const instColsWithOwner = await db.select<{ name: string }[]>("PRAGMA table_info(institutions)");
        const instNames = instColsWithOwner.map((c) => c.name);
        if (!instNames.includes("owner_user_id"))
            await db.execute("ALTER TABLE institutions ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");

        const firstUser = await db.select<{ id: number }[]>("SELECT id FROM users ORDER BY id LIMIT 1");
        if (firstUser[0]?.id) {
            await db.execute(
                "UPDATE institutions SET owner_user_id = ? WHERE owner_user_id IS NULL",
                [firstUser[0].id]
            );
        }

        const users = await db.select<{ id: number; name: string }[]>("SELECT id, name FROM users");
        for (const user of users) {
            await ensureInstitutionForUserRecord(db, user.id, user.name);
        }

        await db.execute("UPDATE schema_version SET version = 19 WHERE id = 1");
    }

    // ── always-check: tipo column in eval_entries ─────────────────────────────
    {
        const entryCols = await db.select<{ name: string }[]>("PRAGMA table_info(eval_entries)");
        if (!entryCols.map((c) => c.name).includes("tipo"))
            await db.execute("ALTER TABLE eval_entries ADD COLUMN tipo TEXT NOT NULL DEFAULT 'numerica'");
    }

    {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS local_access_guard (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                access_code TEXT NOT NULL DEFAULT '',
                account_active INTEGER NOT NULL DEFAULT 0,
                last_payment_date TEXT NOT NULL DEFAULT '',
                last_access_date TEXT NOT NULL DEFAULT '',
                blocked_reason TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            )
        `);
        await db.execute("UPDATE schema_version SET version = 20 WHERE id = 1");
    }
}

// ─── Default user ─────────────────────────────────────────────────────────────
async function seedDefaultUser(db: Database) {
    const exists = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM users WHERE email = 'admin@grading.app'"
    );
    if (exists[0].count > 0) return;

    const hash = await hashPassword("admin123");
    await db.execute(
        "INSERT INTO users (email, name, hash) VALUES (?, ?, ?)",
        ["admin@grading.app", "Administrador", hash]
    );
}

// ─── Demo institutions + data ─────────────────────────────────────────────────
async function seedDemoInstitutions(db: Database) {
    const exists = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM institutions"
    );
    if (exists[0].count > 0) return;

    const admin = await db.select<{ id: number }[]>(
        "SELECT id FROM users WHERE email = 'admin@grading.app' LIMIT 1"
    );
    const ownerId = admin[0]?.id ?? 1;

    await db.execute(`INSERT INTO institutions (owner_user_id, name, code, address) VALUES
        (${ownerId}, 'Instituto Nacional Central',  'INC', 'San Salvador'),
        (${ownerId}, 'Colegio García Flamenco',     'CGF', 'Santa Ana'),
        (${ownerId}, 'Centro Escolar España',       'CEE', 'San Miguel')`);

    await seedDemoData(db);
}

function slugifyInstitutionCode(value: string): string {
    const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase();
    return normalized || "INST";
}

async function ensureInstitutionForUserRecord(db: Database, userId: number, userName: string): Promise<void> {
    const existing = await db.select<{ id: number }[]>(
        "SELECT id FROM institutions WHERE owner_user_id = ? LIMIT 1",
        [userId]
    );
    if (existing[0]) return;

    const baseCode = slugifyInstitutionCode(`inst-${userId}`);
    let code = baseCode;
    let suffix = 1;
    while (true) {
        const taken = await db.select<{ count: number }[]>(
            "SELECT COUNT(*) as count FROM institutions WHERE code = ?",
            [code]
        );
        if (!taken[0]?.count) break;
        suffix += 1;
        code = `${baseCode}-${suffix}`;
    }

    await db.execute(
        "INSERT INTO institutions (owner_user_id, name, code, address) VALUES (?, ?, ?, ?)",
        [userId, `Institución de ${userName}`, code, null]
    );
}

export async function ensureInstitutionForUser(userId: number, userName: string): Promise<void> {
    const db = await getDb();
    await ensureInstitutionForUserRecord(db, userId, userName);
}

async function seedDemoData(db: Database) {
    // INC — asignaturas
    await db.execute(`INSERT INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
        ('a1', 1, 2025, 'Matemáticas II',    'Grupo A', 32),
        ('a2', 1, 2025, 'Ciencias Naturales','Grupo B', 28),
        ('a3', 1, 2024, 'Historia Universal','Grupo C', 24)`);
    await db.execute(`INSERT INTO semestres (id, asignatura_id, nombre) VALUES
        ('s1','a1','Semestre I'),('s2','a1','Semestre II'),
        ('s3','a2','Semestre I'),('s4','a2','Semestre II'),
        ('s5','a3','Semestre I'),('s6','a3','Semestre II')`);

    // CGF — asignaturas
    await db.execute(`INSERT INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
        ('b1', 2, 2025, 'Álgebra I', 'Sección A', 30),
        ('b2', 2, 2025, 'Biología',  'Sección B', 26)`);
    await db.execute(`INSERT INTO semestres (id, asignatura_id, nombre) VALUES
        ('sb1','b1','Semestre I'),('sb2','b1','Semestre II'),
        ('sb3','b2','Semestre I'),('sb4','b2','Semestre II')`);

    // CEE — asignaturas
    await db.execute(`INSERT INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
        ('c1', 3, 2025, 'Lenguaje y Literatura','Sección Única', 30)`);
    await db.execute(`INSERT INTO semestres (id, asignatura_id, nombre) VALUES
        ('sc1','c1','Semestre I'),('sc2','c1','Semestre II')`);

    // INC — estudiantes
    await db.execute(`INSERT INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
        ('e1',1,'Ana García López',     '1-2345-6789','+503 7123-4567',16,'no_tiene'),
        ('e2',1,'Carlos Pérez Ramos',   '2-3456-7890','+503 7234-5678',17,'acceso'),
        ('e3',1,'María Santos Ruiz',    '3-4567-8901','+503 7345-6789',15,'significativa'),
        ('e4',1,'Luis Martínez Vega',   '4-5678-9012','+503 7456-7890',16,'no_significativa'),
        ('e5',1,'Sofía Hernández Cruz', '5-6789-0123','+503 7567-8901',17,'no_tiene')`);
    await db.execute(`INSERT INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
        ('e1','a1'),('e1','a2'),
        ('e2','a1'),
        ('e3','a2'),('e3','a3'),
        ('e4','a3'),('e5','a1'),('e5','a2')`);

    // CGF — estudiantes
    await db.execute(`INSERT INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
        ('f1',2,'Roberto Flores','6-1234-5678','+503 7654-3210',15,'no_tiene'),
        ('f2',2,'Laura Campos',  '7-2345-6789','+503 7543-2109',16,'acceso'),
        ('f3',2,'Diego Ramírez', '8-3456-7890','+503 7432-1098',17,'no_tiene')`);
    await db.execute(`INSERT INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
        ('f1','b1'),('f1','b2'),
        ('f2','b1'),
        ('f3','b2')`);

    // CEE — estudiantes
    await db.execute(`INSERT INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
        ('g1',3,'Valentina Morales','9-4567-8901','+503 7321-0987',15,'no_tiene'),
        ('g2',3,'Andrés Castillo',  '0-5678-9012','+503 7210-9876',16,'no_tiene')`);
    await db.execute(`INSERT INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
        ('g1','c1'),('g2','c1')`);
}

// ─── Demo eval entries (v13) ──────────────────────────────────────────────────
async function seedDemoEvalEntries(db: Database) {
    const check = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM eval_entries ee
         JOIN evaluaciones ev ON ev.id = ee.evaluacion_id
         WHERE ev.institution_id = 1`
    );
    if (check[0].count > 0) return;

    type Pair = { evalId: string; estId: string; asigId: string; nombre: string };
    const pairs: Pair[] = [
        { evalId: 'de_e1_a1', estId: 'e1', asigId: 'a1', nombre: 'Ana García López' },
        { evalId: 'de_e2_a1', estId: 'e2', asigId: 'a1', nombre: 'Carlos Pérez Ramos' },
        { evalId: 'de_e5_a1', estId: 'e5', asigId: 'a1', nombre: 'Sofía Hernández Cruz' },
        { evalId: 'de_e1_a2', estId: 'e1', asigId: 'a2', nombre: 'Ana García López' },
        { evalId: 'de_e3_a2', estId: 'e3', asigId: 'a2', nombre: 'María Santos Ruiz' },
        { evalId: 'de_e5_a2', estId: 'e5', asigId: 'a2', nombre: 'Sofía Hernández Cruz' },
    ];
    for (const p of pairs) {
        const row = await db.select<{ id: string }[]>(
            "SELECT id FROM evaluaciones WHERE estudiante_id=? AND asignatura_id=?",
            [p.estId, p.asigId]
        );
        if (row.length === 0) {
            await db.execute(
                "INSERT INTO evaluaciones (id,institution_id,asignatura_id,nombre,estudiante_id) VALUES (?,1,?,?,?)",
                [p.evalId, p.asigId, p.nombre, p.estId]
            );
        } else {
            p.evalId = row[0].id;
        }
    }

    let seq = 0;
    const sid = () => `se${++seq}`;

    type ItemT = { nombre: string; desc: string; valor: number };
    type TemaT = { tema: string; items: ItemT[] };
    type EntryT = { category: string; nombre: string; semestre: string; temas: TemaT[] };

    async function ins(evalId: string, templates: EntryT[], f: number) {
        for (const t of templates) {
            const entryId = sid();
            const pct = t.temas.flatMap(tm => tm.items).reduce((s, i) => s + i.valor, 0);
            await db.execute(
                "INSERT INTO eval_entries (id,evaluacion_id,category,nombre,pct,semestre) VALUES (?,?,?,?,?,?)",
                [entryId, evalId, t.category, t.nombre, pct, t.semestre]
            );
            for (const tm of t.temas) {
                for (const i of tm.items) {
                    await db.execute(
                        "INSERT INTO eval_temas (id,entry_id,tema,nombre,descripcion,valor,nota) VALUES (?,?,?,?,?,?,?)",
                        [sid(), entryId, tm.tema, i.nombre, i.desc, i.valor, Math.max(0, Math.round(i.valor * f))]
                    );
                }
            }
        }
    }

    // ── Matemáticas II (a1) templates ─────────────────────────────────────────
    const a1: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Álgebra', items:[
                { nombre:'Ecuaciones lineales', desc:'Resolución de ecuaciones de primer grado', valor:10 },
                { nombre:'Factorización', desc:'Factorizar expresiones algebraicas', valor:5 },
            ]},
            { tema:'Geometría', items:[
                { nombre:'Área de figuras planas', desc:'Cálculo de áreas de triángulos y rectángulos', valor:5 },
            ]},
        ]},
        { category:'tareas', nombre:'Tarea 1', semestre:'s1', temas:[
            { tema:'Ejercicios de álgebra', items:[
                { nombre:'Sistemas de ecuaciones', desc:'Resolución de sistemas 2×2', valor:5 },
                { nombre:'Inecuaciones', desc:'Resolución de inecuaciones lineales', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Participación S. I', semestre:'s1', temas:[
            { tema:'Actitud en clase', items:[
                { nombre:'Participación oral', desc:'Resolución de problemas en pizarra', valor:5 },
                { nombre:'Trabajo en equipo', desc:'Colaboración en actividades grupales', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'Estadística', items:[
                { nombre:'Media y mediana', desc:'Medidas de tendencia central', valor:8 },
                { nombre:'Moda y rango', desc:'Identificación de la moda', valor:4 },
            ]},
            { tema:'Probabilidad', items:[
                { nombre:'Experimentos aleatorios', desc:'Espacio muestral y eventos', valor:8 },
            ]},
        ]},
        { category:'proyecto', nombre:'Proyecto Final', semestre:'s2', temas:[
            { tema:'Investigación estadística', items:[
                { nombre:'Planteamiento del problema', desc:'Definición del problema a investigar', valor:5 },
                { nombre:'Recopilación de datos', desc:'Métodos de recolección y organización', valor:5 },
                { nombre:'Análisis y conclusiones', desc:'Interpretación de resultados', valor:5 },
            ]},
        ]},
    ];

    // ── Ciencias Naturales (a2) templates ─────────────────────────────────────
    const a2: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Ecosistemas', items:[
                { nombre:'Cadena alimentaria', desc:'Productores, consumidores y descomponedores', valor:8 },
                { nombre:'Biomas del mundo', desc:'Características de los principales biomas', valor:6 },
            ]},
            { tema:'Células', items:[
                { nombre:'Estructura celular', desc:'Partes de la célula animal y vegetal', valor:6 },
            ]},
        ]},
        { category:'tareas', nombre:'Tarea 1', semestre:'s1', temas:[
            { tema:'Biología celular', items:[
                { nombre:'Diagrama de célula', desc:'Dibujo y etiquetado de la célula', valor:5 },
                { nombre:'Comparación célula animal/vegetal', desc:'Tabla comparativa', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Trabajo de Laboratorio S. I', semestre:'s1', temas:[
            { tema:'Laboratorio', items:[
                { nombre:'Observación microscópica', desc:'Uso correcto del microscopio', valor:5 },
                { nombre:'Informe de laboratorio', desc:'Redacción de conclusiones', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'El cuerpo humano', items:[
                { nombre:'Sistema respiratorio', desc:'Órganos y función del sistema respiratorio', valor:8 },
                { nombre:'Sistema circulatorio', desc:'Estructura del corazón y circulación', valor:6 },
            ]},
            { tema:'Genética básica', items:[
                { nombre:'Leyes de Mendel', desc:'Primera y segunda ley de Mendel', valor:6 },
            ]},
        ]},
        { category:'proyecto', nombre:'Proyecto de Ciencias', semestre:'s2', temas:[
            { tema:'Experimento científico', items:[
                { nombre:'Hipótesis y metodología', desc:'Planteamiento y diseño del experimento', valor:5 },
                { nombre:'Ejecución del experimento', desc:'Aplicación del método científico', valor:5 },
                { nombre:'Presentación oral', desc:'Exposición de resultados ante la clase', valor:5 },
            ]},
        ]},
    ];

    // score ≈ 20 + factor*80  →  1.0=100%, 0.90=92%, 0.80=84%, 0.65=72%, 0.50=60%, 0.38=50%
    await ins(pairs[0].evalId, a1, 0.90); // Ana   a1 — eximido  (~92%)
    await ins(pairs[1].evalId, a1, 0.50); // Carlos a1 — reprobado (~60%)
    await ins(pairs[2].evalId, a1, 1.00); // Sofía  a1 — 100%
    await ins(pairs[3].evalId, a2, 0.80); // Ana   a2 — aprobado (~84%)
    await ins(pairs[4].evalId, a2, 0.38); // María  a2 — reprobado (~50%)
    await ins(pairs[5].evalId, a2, 1.00); // Sofía  a2 — 100%
}

async function seedMoreDemoData(db: Database) {
    // ── New INC asignaturas ────────────────────────────────────────────────────
    await db.execute(`INSERT OR IGNORE INTO asignaturas (id,institution_id,año,nombre,grupo,seccion,lecciones) VALUES
        ('a4',1,2025,'Lengua y Literatura','7','1',30),
        ('a5',1,2025,'Ciencias Sociales','8','2',24),
        ('a6',1,2025,'Inglés I','9','1',28)`);

    // ── New INC students ──────────────────────────────────────────────────────
    await db.execute(`INSERT OR IGNORE INTO estudiantes (id,institution_id,nombre_completo,edad,adecuacion) VALUES
        ('h1',1,'Pedro Jiménez Mora',16,'no_tiene'),
        ('h2',1,'Fernanda López Díaz',17,'acceso'),
        ('h3',1,'José Antonio Vargas',16,'no_tiene'),
        ('h4',1,'Lucía Ramírez Castro',15,'no_significativa'),
        ('h5',1,'Miguel Ángel Torres',17,'no_tiene'),
        ('h6',1,'Carmen Beatriz Fuentes',16,'no_tiene'),
        ('h7',1,'Rodrigo Estrada Mejía',17,'no_tiene')`);

    // ── Enrollments ────────────────────────────────────────────────────────────
    const newEnrolls: [string, string][] = [
        ['h1','a4'],['h2','a4'],['h3','a4'],['e1','a4'],
        ['h4','a5'],['h5','a5'],['h6','a5'],['e2','a5'],
        ['h7','a6'],['h1','a6'],['h4','a6'],['e3','a6'],
    ];
    for (const [est, asig] of newEnrolls) {
        await db.execute(
            "INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id,asignatura_id) VALUES (?,?)",
            [est, asig]
        );
    }

    // ── Eval entries ───────────────────────────────────────────────────────────
    // Check if already seeded (eval_entries exist for a3/a4/a5/a6)
    const existing = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM eval_entries ee
         JOIN evaluaciones ev ON ev.id = ee.evaluacion_id
         WHERE ev.asignatura_id IN ('a3','a4','a5','a6')`
    );
    if (existing[0].count > 0) return;

    // Ensure evaluaciones rows exist for each new pair
    type Pair = { evalId: string; estId: string; asigId: string; nombre: string };
    const pairs: Pair[] = [
        // a3 — Historia Universal
        { evalId:'de_e3_a3', estId:'e3', asigId:'a3', nombre:'María Santos Ruiz' },
        { evalId:'de_e4_a3', estId:'e4', asigId:'a3', nombre:'Luis Martínez Vega' },
        // a4 — Lengua y Literatura
        { evalId:'de_h1_a4', estId:'h1', asigId:'a4', nombre:'Pedro Jiménez Mora' },
        { evalId:'de_h2_a4', estId:'h2', asigId:'a4', nombre:'Fernanda López Díaz' },
        { evalId:'de_h3_a4', estId:'h3', asigId:'a4', nombre:'José Antonio Vargas' },
        { evalId:'de_e1_a4', estId:'e1', asigId:'a4', nombre:'Ana García López' },
        // a5 — Ciencias Sociales
        { evalId:'de_h4_a5', estId:'h4', asigId:'a5', nombre:'Lucía Ramírez Castro' },
        { evalId:'de_h5_a5', estId:'h5', asigId:'a5', nombre:'Miguel Ángel Torres' },
        { evalId:'de_h6_a5', estId:'h6', asigId:'a5', nombre:'Carmen Beatriz Fuentes' },
        { evalId:'de_e2_a5', estId:'e2', asigId:'a5', nombre:'Carlos Pérez Ramos' },
        // a6 — Inglés I
        { evalId:'de_h7_a6', estId:'h7', asigId:'a6', nombre:'Rodrigo Estrada Mejía' },
        { evalId:'de_h1_a6', estId:'h1', asigId:'a6', nombre:'Pedro Jiménez Mora' },
        { evalId:'de_h4_a6', estId:'h4', asigId:'a6', nombre:'Lucía Ramírez Castro' },
        { evalId:'de_e3_a6', estId:'e3', asigId:'a6', nombre:'María Santos Ruiz' },
    ];
    for (const p of pairs) {
        const row = await db.select<{ id: string }[]>(
            "SELECT id FROM evaluaciones WHERE estudiante_id=? AND asignatura_id=?",
            [p.estId, p.asigId]
        );
        if (row.length === 0) {
            await db.execute(
                "INSERT INTO evaluaciones (id,institution_id,asignatura_id,nombre,estudiante_id) VALUES (?,1,?,?,?)",
                [p.evalId, p.asigId, p.nombre, p.estId]
            );
        } else {
            p.evalId = row[0].id;
        }
    }

    let sq = 0;
    const sid = () => `sv${++sq}`;

    type ItemT = { nombre: string; desc: string; valor: number };
    type TemaT = { tema: string; items: ItemT[] };
    type EntryT = { category: string; nombre: string; semestre: string; temas: TemaT[] };

    async function insertTemplates(evalId: string, templates: EntryT[], factor: number) {
        for (const t of templates) {
            const entryId = sid();
            const pct = t.temas.flatMap(tm => tm.items).reduce((s, i) => s + i.valor, 0);
            await db.execute(
                "INSERT INTO eval_entries (id,evaluacion_id,category,nombre,pct,semestre) VALUES (?,?,?,?,?,?)",
                [entryId, evalId, t.category, t.nombre, pct, t.semestre]
            );
            for (const tm of t.temas) {
                for (const i of tm.items) {
                    await db.execute(
                        "INSERT INTO eval_temas (id,entry_id,tema,nombre,descripcion,valor,nota) VALUES (?,?,?,?,?,?,?)",
                        [sid(), entryId, tm.tema, i.nombre, i.desc, i.valor, Math.max(0, Math.round(i.valor * factor))]
                    );
                }
            }
        }
    }

    // ── Templates ─────────────────────────────────────────────────────────────
    const a3Templates: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Antigua Grecia', items:[
                { nombre:'Democracia ateniense', desc:'Origen y características de la democracia griega', valor:8 },
                { nombre:'Cultura y filosofía', desc:'Principales filósofos y su legado', valor:6 },
            ]},
            { tema:'Roma Antigua', items:[
                { nombre:'La República romana', desc:'Instituciones y magistraturas', valor:6 },
            ]},
        ]},
        { category:'tareas', nombre:'Tarea 1', semestre:'s1', temas:[
            { tema:'Línea del tiempo', items:[
                { nombre:'Organización cronológica', desc:'Ubicación de eventos en el tiempo', valor:5 },
                { nombre:'Descripción de eventos', desc:'Síntesis de hitos históricos', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Participación S. I', semestre:'s1', temas:[
            { tema:'Clases participativas', items:[
                { nombre:'Debate histórico', desc:'Argumentación basada en evidencia', valor:5 },
                { nombre:'Análisis de fuentes', desc:'Lectura crítica de documentos históricos', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'Edad Media', items:[
                { nombre:'El feudalismo', desc:'Estructura social y económica feudal', valor:8 },
                { nombre:'Las Cruzadas', desc:'Causas y consecuencias de las Cruzadas', valor:6 },
            ]},
            { tema:'Renacimiento', items:[
                { nombre:'Arte y ciencia renacentistas', desc:'Principales figuras y obras del Renacimiento', valor:6 },
            ]},
        ]},
        { category:'proyecto', nombre:'Proyecto Histórico', semestre:'s2', temas:[
            { tema:'Investigación histórica', items:[
                { nombre:'Selección de fuentes', desc:'Identificación de fuentes primarias y secundarias', valor:5 },
                { nombre:'Análisis crítico', desc:'Interpretación y contextualización de la información', valor:5 },
                { nombre:'Presentación escrita', desc:'Redacción clara y estructurada del trabajo', valor:5 },
            ]},
        ]},
    ];

    const a4Templates: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Narrativa', items:[
                { nombre:'Estructura del cuento', desc:'Identificar inicio, nudo y desenlace', valor:10 },
                { nombre:'Análisis de personajes', desc:'Clasificación y caracterización de personajes', valor:5 },
            ]},
            { tema:'Gramática', items:[
                { nombre:'Ortografía y puntuación', desc:'Uso correcto de tildes y signos de puntuación', valor:5 },
            ]},
        ]},
        { category:'tareas', nombre:'Tarea 1', semestre:'s1', temas:[
            { tema:'Redacción creativa', items:[
                { nombre:'Coherencia y cohesión', desc:'Uso adecuado de conectores y referencia', valor:5 },
                { nombre:'Riqueza vocabular', desc:'Uso de sinónimos y vocabulario variado', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Lectura en clase S. I', semestre:'s1', temas:[
            { tema:'Comprensión lectora', items:[
                { nombre:'Lectura expresiva', desc:'Entonación y ritmo en la lectura oral', valor:5 },
                { nombre:'Comprensión del texto', desc:'Respuesta a preguntas sobre el texto leído', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'Poesía', items:[
                { nombre:'Figuras literarias', desc:'Identificación de metáfora, símil y personificación', valor:8 },
                { nombre:'Análisis de poema', desc:'Métrica, rima y contenido', valor:6 },
            ]},
            { tema:'Ensayo', items:[
                { nombre:'Estructura del ensayo', desc:'Introducción, desarrollo y conclusión', valor:6 },
            ]},
        ]},
        { category:'proyecto', nombre:'Antología literaria', semestre:'s2', temas:[
            { tema:'Proyecto de escritura', items:[
                { nombre:'Selección de textos', desc:'Criterios de selección y justificación', valor:5 },
                { nombre:'Análisis crítico', desc:'Comentario literario de cada texto', valor:5 },
                { nombre:'Presentación final', desc:'Diseño, orden y presentación oral', valor:5 },
            ]},
        ]},
    ];

    const a5Templates: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Historia de América', items:[
                { nombre:'La Conquista', desc:'Proceso de conquista española en América', valor:8 },
                { nombre:'Culturas precolombinas', desc:'Principales civilizaciones mayas, aztecas e incas', valor:6 },
            ]},
            { tema:'Geografía física', items:[
                { nombre:'Relieve centroamericano', desc:'Principales cordilleras, volcanes y costas', valor:6 },
            ]},
        ]},
        { category:'tareas', nombre:'Tarea 1', semestre:'s1', temas:[
            { tema:'Síntesis conceptual', items:[
                { nombre:'Mapa conceptual', desc:'Organización jerárquica de conceptos', valor:5 },
                { nombre:'Cuadro comparativo', desc:'Comparación de civilizaciones precolombinas', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Exposición oral S. I', semestre:'s1', temas:[
            { tema:'Comunicación oral', items:[
                { nombre:'Dominio del tema', desc:'Manejo conceptual del contenido expuesto', valor:5 },
                { nombre:'Expresión y postura', desc:'Claridad, volumen y lenguaje no verbal', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'Economía', items:[
                { nombre:'Sectores económicos', desc:'Primario, secundario y terciario', valor:8 },
                { nombre:'Comercio exterior', desc:'Importaciones, exportaciones y balanza comercial', valor:6 },
            ]},
            { tema:'Educación cívica', items:[
                { nombre:'Derechos humanos', desc:'Declaración Universal y aplicación local', valor:6 },
            ]},
        ]},
        { category:'proyecto', nombre:'Investigación social', semestre:'s2', temas:[
            { tema:'Metodología de investigación', items:[
                { nombre:'Marco teórico', desc:'Revisión bibliográfica y conceptualización', valor:5 },
                { nombre:'Análisis de datos', desc:'Interpretación de estadísticas sociales', valor:5 },
                { nombre:'Conclusiones y recomendaciones', desc:'Síntesis y propuestas de mejora', valor:5 },
            ]},
        ]},
    ];

    const a6Templates: EntryT[] = [
        { category:'prueba', nombre:'Prueba 1', semestre:'s1', temas:[
            { tema:'Grammar', items:[
                { nombre:'Simple Present', desc:'Affirmative, negative and interrogative forms', valor:8 },
                { nombre:'Articles and determiners', desc:'Definite and indefinite articles', valor:6 },
            ]},
            { tema:'Vocabulary', items:[
                { nombre:'Family and home', desc:'Vocabulary related to family members and rooms', valor:6 },
            ]},
        ]},
        { category:'tareas', nombre:'Written Composition', semestre:'s1', temas:[
            { tema:'Writing skills', items:[
                { nombre:'Text organization', desc:'Introduction, body and conclusion', valor:5 },
                { nombre:'Grammar accuracy', desc:'Correct use of studied structures', valor:5 },
            ]},
        ]},
        { category:'cotidiano', nombre:'Oral Practice S. I', semestre:'s1', temas:[
            { tema:'Speaking', items:[
                { nombre:'Pronunciation', desc:'Correct pronunciation of vowel and consonant sounds', valor:5 },
                { nombre:'Fluency', desc:'Ability to communicate ideas without long pauses', valor:5 },
            ]},
        ]},
        { category:'prueba', nombre:'Prueba 2', semestre:'s2', temas:[
            { tema:'Grammar', items:[
                { nombre:'Simple Past', desc:'Regular and irregular verbs in past tense', valor:8 },
                { nombre:'Modal verbs', desc:'Can, could, should, must usage', valor:6 },
            ]},
            { tema:'Reading', items:[
                { nombre:'Reading comprehension', desc:'Main idea, details and inference from texts', valor:6 },
            ]},
        ]},
        { category:'proyecto', nombre:'Oral Presentation', semestre:'s2', temas:[
            { tema:'Oral project', items:[
                { nombre:'Content and organization', desc:'Clear structure and relevant information', valor:5 },
                { nombre:'Delivery', desc:'Eye contact, pace and confidence', valor:5 },
                { nombre:'Language use', desc:'Vocabulary and grammar accuracy during presentation', valor:5 },
            ]},
        ]},
    ];

    // ── Per-student factors: [s1 factor, s2 factor] ───────────────────────────
    const factors: Record<string, [number, number]> = {
        // a3 history
        e3: [0.47, 0.43],
        e4: [0.72, 0.70],
        // a4 language
        h1: [0.83, 0.80],
        h2: [0.95, 0.93],
        h3: [0.66, 0.64],
        e1: [0.88, 0.86],
        // a5 social
        h4: [0.50, 0.48],
        h5: [0.84, 0.82],
        h6: [0.73, 0.71],
        e2: [0.65, 0.63],
        // a6 english
        h7: [0.92, 0.90],
        // h1 reused for a6
        // h4 reused for a6
        // e3 reused for a6
    };
    // override a6-specific factors (h1, h4, e3 appear in multiple subjects with different performance)
    const a6Factors: Record<string, [number, number]> = {
        h7: [0.92, 0.90],
        h1: [0.78, 0.75],
        h4: [0.49, 0.46],
        e3: [0.42, 0.39],
    };

    // Apply templates per subject
    const subjectData: { asigId: string; templates: EntryT[]; pairIds: { estId: string; evalId: string }[]; facMap: Record<string, [number, number]> }[] = [
        {
            asigId: 'a3',
            templates: a3Templates,
            pairIds: pairs.filter(p => p.asigId === 'a3').map(p => ({ estId: p.estId, evalId: p.evalId })),
            facMap: factors,
        },
        {
            asigId: 'a4',
            templates: a4Templates,
            pairIds: pairs.filter(p => p.asigId === 'a4').map(p => ({ estId: p.estId, evalId: p.evalId })),
            facMap: factors,
        },
        {
            asigId: 'a5',
            templates: a5Templates,
            pairIds: pairs.filter(p => p.asigId === 'a5').map(p => ({ estId: p.estId, evalId: p.evalId })),
            facMap: factors,
        },
        {
            asigId: 'a6',
            templates: a6Templates,
            pairIds: pairs.filter(p => p.asigId === 'a6').map(p => ({ estId: p.estId, evalId: p.evalId })),
            facMap: a6Factors,
        },
    ];

    for (const subj of subjectData) {
        for (const { estId, evalId } of subj.pairIds) {
            const [f1, f2] = subj.facMap[estId] ?? [0.7, 0.7];
            const s1Templates = subj.templates.filter(t => t.semestre === 's1');
            const s2Templates = subj.templates.filter(t => t.semestre === 's2');
            await insertTemplates(evalId, s1Templates, f1);
            await insertTemplates(evalId, s2Templates, f2);
        }
    }
}
