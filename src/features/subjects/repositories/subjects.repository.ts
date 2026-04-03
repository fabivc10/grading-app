import { getDb } from "../../../shared/lib/db";
import type { AsignaturaDTO, SemestreDTO } from "../types";

export async function findByInstitution(institutionId: number): Promise<AsignaturaDTO[]> {
    const db = await getDb();
    return db.select<AsignaturaDTO[]>(
        "SELECT id, institution_id, year, name as nombre, group_name as grupo, section as seccion, lesson_count as lecciones, created_at FROM subjects WHERE institution_id = ? ORDER BY year DESC, name",
        [institutionId]
    );
}

export async function findSemestresByAsignaturas(asignaturaIds: string[]): Promise<SemestreDTO[]> {
    if (!asignaturaIds.length) return [];
    const db = await getDb();
    const placeholders = asignaturaIds.map(() => "?").join(",");
    return db.select<SemestreDTO[]>(
        `SELECT id, subject_id as asignatura_id, name as nombre FROM terms WHERE subject_id IN (${placeholders})`,
        asignaturaIds
    );
}

export async function insert(
    id: string,
    institutionId: number,
    year: number,
    nombre: string,
    grupo: string,
    seccion: string,
    lecciones: number,
    createdAt: string
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO subjects (id, institution_id, year, name, group_name, section, lesson_count, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [id, institutionId, year, nombre, grupo, seccion, lecciones, createdAt]
    );
}

export async function insertSemestre(id: string, asignaturaId: string, nombre: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO terms (id, subject_id, name) VALUES (?,?,?)",
        [id, asignaturaId, nombre]
    );
}

export async function update(
    id: string,
    year: number,
    nombre: string,
    grupo: string,
    seccion: string,
    lecciones: number
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE subjects SET year=?, name=?, group_name=?, section=?, lesson_count=? WHERE id=?",
        [year, nombre, grupo, seccion, lecciones, id]
    );
}

export async function updateSemestre(id: string, nombre: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE terms SET name=? WHERE id=?", [nombre, id]);
}

export async function remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM subjects WHERE id=?", [id]);
}

export async function decrementLecciones(id: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE subjects SET lesson_count = MAX(0, lesson_count - 1) WHERE id=?",
        [id]
    );
}
