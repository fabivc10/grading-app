-- ─────────────────────────────────────────────────────────────────────────────
-- Grading App — Database Schema
-- All domain tables carry institution_id so every query is scoped to one tenant.
-- NOTE: The authoritative migration runner is src/shared/lib/db.ts.
--       This file is kept in sync for reference and manual inspection.
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Schema version tracker ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT    NOT NULL UNIQUE,
    name  TEXT    NOT NULL,
    hash  TEXT    NOT NULL   -- SHA-256 hex of the plaintext password
);

-- ── Institutions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS institutions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    code          TEXT NOT NULL UNIQUE,
    address       TEXT
);

-- ── Asignaturas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asignaturas (
    id             TEXT    PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    año            INTEGER NOT NULL,
    nombre         TEXT    NOT NULL,
    grupo          TEXT    NOT NULL,
    seccion        TEXT    NOT NULL DEFAULT '',
    lecciones      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS semestres (
    id            TEXT PRIMARY KEY,
    asignatura_id TEXT NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
    nombre        TEXT NOT NULL,
    start_date    TEXT NOT NULL DEFAULT '',
    end_date      TEXT NOT NULL DEFAULT ''
);

-- ── Estudiantes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estudiantes (
    id              TEXT    PRIMARY KEY,
    institution_id  INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    nombre_completo TEXT    NOT NULL,
    cedula          TEXT,
    telefono        TEXT,
    edad            INTEGER NOT NULL DEFAULT 0,
    adecuacion      TEXT    NOT NULL DEFAULT 'no_tiene'
        CHECK(adecuacion IN ('acceso','significativa','no_significativa','no_tiene'))
);

-- Enrollment: which asignaturas a student belongs to
CREATE TABLE IF NOT EXISTS estudiante_asignaturas (
    estudiante_id  TEXT NOT NULL REFERENCES estudiantes(id)  ON DELETE CASCADE,
    asignatura_id  TEXT NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
    PRIMARY KEY (estudiante_id, asignatura_id)
);

-- ── Horario ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horario_entries (
    id             TEXT    PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    asignatura_id  TEXT    NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
    day            INTEGER NOT NULL,   -- 0=Lunes … 4=Viernes
    slot           INTEGER NOT NULL,   -- 0-based 10-min slot index
    leccion_num    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS horario_breaks (
    id             TEXT    PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    nombre         TEXT    NOT NULL,
    start_slot     INTEGER NOT NULL,
    duration_slots INTEGER NOT NULL,
    days           TEXT    NOT NULL    -- JSON array e.g. [0,1,2,3,4]
);

-- ── Evaluaciones ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluaciones (
    id             TEXT    PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    asignatura_id  TEXT    NOT NULL REFERENCES asignaturas(id)  ON DELETE CASCADE,
    nombre         TEXT    NOT NULL,
    estudiante_id  TEXT    REFERENCES estudiantes(id) ON DELETE CASCADE
);

-- Named evaluations within each asignatura category
CREATE TABLE IF NOT EXISTS eval_entries (
    id            TEXT    PRIMARY KEY,
    evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
    category      TEXT    NOT NULL   -- 'cotidiano' | 'tareas' | 'prueba' | 'proyecto'
        CHECK(category IN ('cotidiano','tareas','prueba','proyecto')),
    nombre        TEXT    NOT NULL,
    pct           REAL    NOT NULL DEFAULT 0
);

-- Content items (puntos) within an eval_entry, grouped by tema
CREATE TABLE IF NOT EXISTS eval_temas (
    id          TEXT    PRIMARY KEY,
    entry_id    TEXT    NOT NULL REFERENCES eval_entries(id) ON DELETE CASCADE,
    tema        TEXT    NOT NULL,
    nombre      TEXT    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    valor       REAL    NOT NULL DEFAULT 0,
    nota        REAL    NOT NULL DEFAULT 0
);

-- ── Global per-institution key-value settings ────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    key            TEXT    NOT NULL,
    value          TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (institution_id, key)
);

-- Attendance tracking: one row per (evaluacion, semestre, week)
CREATE TABLE IF NOT EXISTS eval_asistencia (
    id            TEXT    PRIMARY KEY,
    evaluacion_id TEXT    NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
    semestre      TEXT    NOT NULL,
    semana        INTEGER NOT NULL,
    dias          TEXT    NOT NULL,   -- JSON boolean[] e.g. [true,true,false,true,true]
    UNIQUE (evaluacion_id, semestre, semana)
);

-- ── Student-level: conducta % + cotidiano entries ─────────────────────────────
CREATE TABLE IF NOT EXISTS student_cotidiano (
    estudiante_id TEXT    PRIMARY KEY REFERENCES estudiantes(id) ON DELETE CASCADE,
    conducta_pct  INTEGER NOT NULL DEFAULT 100
);

-- Named cotidiano evaluations per student
CREATE TABLE IF NOT EXISTS student_cotidiano_entries (
    id            TEXT    PRIMARY KEY,
    estudiante_id TEXT    NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    nombre        TEXT    NOT NULL,
    pct           REAL    NOT NULL DEFAULT 0
);

-- Content items within a cotidiano entry
CREATE TABLE IF NOT EXISTS student_cotidiano_items (
    id          TEXT    PRIMARY KEY,
    entry_id    TEXT    NOT NULL REFERENCES student_cotidiano_entries(id) ON DELETE CASCADE,
    tema        TEXT    NOT NULL,
    nombre      TEXT    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    valor       REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS local_access_guard (
    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_code       TEXT    NOT NULL DEFAULT '',
    account_active    INTEGER NOT NULL DEFAULT 0,
    last_payment_date TEXT    NOT NULL DEFAULT '',
    last_access_date  TEXT    NOT NULL DEFAULT '',
    blocked_reason    TEXT    NOT NULL DEFAULT '',
    updated_at        TEXT    NOT NULL DEFAULT ''
);
