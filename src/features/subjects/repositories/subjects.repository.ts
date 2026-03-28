import { getDb } from "../../../shared/lib/db";
import type { AsignaturaDTO, SemestreDTO } from "../types";

export async function findByInstitution(institutionId: number): Promise<AsignaturaDTO[]> {
    const db = await getDb();
    return db.select<AsignaturaDTO[]>(
        'SELECT id, institution_id, "año" as year, nombre, grupo, seccion, lecciones, created_at FROM asignaturas WHERE institution_id = ? ORDER BY "año" DESC, nombre',
        [institutionId]
    );
}

export async function findSemestresByAsignaturas(asignaturaIds: string[]): Promise<SemestreDTO[]> {
    if (!asignaturaIds.length) return [];
    const db = await getDb();
    const placeholders = asignaturaIds.map(() => "?").join(",");
    return db.select<SemestreDTO[]>(
        `SELECT * FROM semestres WHERE asignatura_id IN (${placeholders})`,
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
        'INSERT INTO asignaturas (id, institution_id, "año", nombre, grupo, seccion, lecciones, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, institutionId, year, nombre, grupo, seccion, lecciones, createdAt]
    );
}

export async function insertSemestre(id: string, asignaturaId: string, nombre: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO semestres (id, asignatura_id, nombre) VALUES (?,?,?)",
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
        'UPDATE asignaturas SET "año"=?, nombre=?, grupo=?, seccion=?, lecciones=? WHERE id=?',
        [year, nombre, grupo, seccion, lecciones, id]
    );
}

export async function updateSemestre(id: string, nombre: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE semestres SET nombre=? WHERE id=?", [nombre, id]);
}

export async function remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM asignaturas WHERE id=?", [id]);
}

export async function decrementLecciones(id: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE asignaturas SET lecciones = MAX(0, lecciones - 1) WHERE id=?",
        [id]
    );
}
