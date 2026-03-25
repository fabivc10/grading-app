import { getDb } from "../../shared/lib/db";
import { genId } from "../../shared/lib/genId";
import type { Estudiante, EstudianteFormData, AsigRef } from "./types";

type EstudianteRow = {
    id: string; institution_id: number; nombre_completo: string;
    cedula: string; telefono: string; edad: number; adecuacion: string;
};
type EnrollRow = {
    estudiante_id: string; asignatura_id: string;
    nombre: string; grupo: string; año: number;
};

export async function fetchEstudiantes(institutionId: number): Promise<Estudiante[]> {
    const db = await getDb();
    const rows = await db.select<EstudianteRow[]>(
        "SELECT * FROM estudiantes WHERE institution_id = ? ORDER BY nombre_completo",
        [institutionId]
    );
    if (!rows.length) return [];

    const enrollRows = await db.select<EnrollRow[]>(
        `SELECT ea.estudiante_id, ea.asignatura_id, a.nombre, a.grupo, a.año
         FROM estudiante_asignaturas ea
         JOIN asignaturas a ON a.id = ea.asignatura_id
         WHERE ea.estudiante_id IN (${rows.map(() => "?").join(",")})`,
        rows.map((r) => r.id)
    );

    return rows.map((r) => ({
        id: r.id,
        nombreCompleto: r.nombre_completo,
        cedula: r.cedula,
        telefono: r.telefono,
        edad: r.edad,
        adecuacion: r.adecuacion as Estudiante["adecuacion"],
        asignaturas: enrollRows
            .filter((e) => e.estudiante_id === r.id)
            .map((e): AsigRef => ({
                id: e.asignatura_id, nombre: e.nombre, grupo: e.grupo, año: e.año,
            })),
    }));
}

export async function insertEstudiante(
    institutionId: number,
    data: EstudianteFormData
): Promise<Estudiante> {
    const db = await getDb();
    const id = genId();
    await db.execute(
        `INSERT INTO estudiantes (id, institution_id, nombre_completo, cedula, telefono, edad, adecuacion)
         VALUES (?,?,?,?,?,?,?)`,
        [id, institutionId, data.nombreCompleto, data.cedula, data.telefono, data.edad, data.adecuacion]
    );
    for (const asig of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES (?,?)",
            [id, asig.id]
        );
    }
    return { id, ...data };
}

export async function updateEstudiante(id: string, data: EstudianteFormData): Promise<void> {
    const db = await getDb();
    await db.execute(
        `UPDATE estudiantes SET nombre_completo=?, cedula=?, telefono=?, edad=?, adecuacion=? WHERE id=?`,
        [data.nombreCompleto, data.cedula, data.telefono, data.edad, data.adecuacion, id]
    );
    await db.execute("DELETE FROM estudiante_asignaturas WHERE estudiante_id=?", [id]);
    for (const asig of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES (?,?)",
            [id, asig.id]
        );
    }
}

export async function deleteEstudiante(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM evaluaciones WHERE estudiante_id = ?", [id]);
    await db.execute("DELETE FROM estudiantes WHERE id=?", [id]);
}
