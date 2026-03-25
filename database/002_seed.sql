-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data — development / demo
-- Each institution has its own isolated set of records.
-- Run AFTER 001_schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Default admin user ────────────────────────────────────────────────────────
-- password: admin123  (SHA-256 hex)
INSERT OR IGNORE INTO users (email, name, hash) VALUES
    ('admin@grading.app', 'Administrador', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- ── Institutions ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO institutions (id, name, code, address) VALUES
    (1, 'Instituto Nacional Central',  'INC', 'San Salvador'),
    (2, 'Colegio García Flamenco',     'CGF', 'Santa Ana'),
    (3, 'Centro Escolar España',       'CEE', 'San Miguel');

-- ── Asignaturas — INC (institution 1) ───────────────────────────────────────
INSERT OR IGNORE INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
    ('a1', 1, 2025, 'Matemáticas II',    'Grupo A', 32),
    ('a2', 1, 2025, 'Ciencias Naturales','Grupo B', 28),
    ('a3', 1, 2024, 'Historia Universal','Grupo C', 24);

INSERT OR IGNORE INTO semestres (id, asignatura_id, nombre) VALUES
    ('s1', 'a1', 'Semestre I'),
    ('s2', 'a1', 'Semestre II'),
    ('s3', 'a2', 'Semestre I'),
    ('s4', 'a2', 'Semestre II'),
    ('s5', 'a3', 'Semestre I'),
    ('s6', 'a3', 'Semestre II');

-- ── Asignaturas — CGF (institution 2) ───────────────────────────────────────
INSERT OR IGNORE INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
    ('b1', 2, 2025, 'Álgebra I',     'Sección A', 30),
    ('b2', 2, 2025, 'Biología',      'Sección B', 26);

INSERT OR IGNORE INTO semestres (id, asignatura_id, nombre) VALUES
    ('sb1', 'b1', 'Semestre I'),
    ('sb2', 'b1', 'Semestre II'),
    ('sb3', 'b2', 'Semestre I'),
    ('sb4', 'b2', 'Semestre II');

-- ── Asignaturas — CEE (institution 3) ───────────────────────────────────────
INSERT OR IGNORE INTO asignaturas (id, institution_id, año, nombre, grupo, lecciones) VALUES
    ('c1', 3, 2025, 'Lenguaje y Literatura', 'Sección Única', 30);

INSERT OR IGNORE INTO semestres (id, asignatura_id, nombre) VALUES
    ('sc1', 'c1', 'Semestre I'),
    ('sc2', 'c1', 'Semestre II');

-- ── Estudiantes — INC (institution 1) ───────────────────────────────────────
INSERT OR IGNORE INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
    ('e1', 1, 'Ana García López',     '1-2345-6789', '+503 7123-4567', 16, 'no_tiene'),
    ('e2', 1, 'Carlos Pérez Ramos',   '2-3456-7890', '+503 7234-5678', 17, 'acceso'),
    ('e3', 1, 'María Santos Ruiz',    '3-4567-8901', '+503 7345-6789', 15, 'significativa'),
    ('e4', 1, 'Luis Martínez Vega',   '4-5678-9012', '+503 7456-7890', 16, 'no_significativa'),
    ('e5', 1, 'Sofía Hernández Cruz', '5-6789-0123', '+503 7567-8901', 17, 'no_tiene');

INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
    ('e1', 'a1'), ('e1', 'a2'),
    ('e2', 'a1'),
    ('e3', 'a2'), ('e3', 'a3'),
    ('e4', 'a3'), ('e5', 'a1'), ('e5', 'a2');

-- ── Estudiantes — CGF (institution 2) ───────────────────────────────────────
INSERT OR IGNORE INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
    ('f1', 2, 'Roberto Flores',  '6-1234-5678', '+503 7654-3210', 15, 'no_tiene'),
    ('f2', 2, 'Laura Campos',    '7-2345-6789', '+503 7543-2109', 16, 'acceso'),
    ('f3', 2, 'Diego Ramírez',   '8-3456-7890', '+503 7432-1098', 17, 'no_tiene');

INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
    ('f1', 'b1'), ('f1', 'b2'),
    ('f2', 'b1'),
    ('f3', 'b2');

-- ── Estudiantes — CEE (institution 3) ───────────────────────────────────────
INSERT OR IGNORE INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion) VALUES
    ('g1', 3, 'Valentina Morales', '9-4567-8901', '+503 7321-0987', 15, 'no_tiene'),
    ('g2', 3, 'Andrés Castillo',   '0-5678-9012', '+503 7210-9876', 16, 'no_tiene');

INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES
    ('g1', 'c1'), ('g2', 'c1');
