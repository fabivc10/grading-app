import Database from "@tauri-apps/plugin-sql";
import { hashPassword } from "./crypto";

// ─── Singleton connection ─────────────────────────────────────────────────────
let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
    if (_db) return _db;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const db = await Database.load("sqlite:grading.db");
        await runMigrations(db);
        _db = db;
        return db;
    })().catch((err) => {
        _initPromise = null; // allow retry on next call
        throw err;
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

    await db.execute(`INSERT INTO institutions (name, code, address) VALUES
        ('Instituto Nacional Central',  'INC', 'San Salvador'),
        ('Colegio García Flamenco',     'CGF', 'Santa Ana'),
        ('Centro Escolar España',       'CEE', 'San Miguel')`);

    await seedDemoData(db);
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
