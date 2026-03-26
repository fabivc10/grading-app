import { getDb } from "../../shared/lib/db";
import { genId } from "../../shared/lib/genId";
import type { Estudiante, EstudianteFormData, AsigRef, Tutor } from "./types";

type EstudianteRow = {
    id: string; institution_id: number; nombre_completo: string;
    cedula: string; adecuacion: string; fecha_nacimiento: string;
    telefono_estudiante: string;
    tutor1_nombre: string; tutor1_telefono: string;
    tutor2_nombre: string; tutor2_telefono: string;
};
type EnrollRow = {
    estudiante_id: string; asignatura_id: string;
    nombre: string; grupo: string; seccion: number; año: number;
};

function rowToTutores(r: EstudianteRow): Tutor[] {
    const tutores: Tutor[] = [];
    if (r.tutor1_nombre || r.tutor1_telefono)
        tutores.push({ nombre: r.tutor1_nombre ?? "", telefono: r.tutor1_telefono ?? "" });
    if (r.tutor2_nombre || r.tutor2_telefono)
        tutores.push({ nombre: r.tutor2_nombre ?? "", telefono: r.tutor2_telefono ?? "" });
    return tutores;
}

export async function fetchEstudiantes(institutionId: number): Promise<Estudiante[]> {
    const db = await getDb();
    const rows = await db.select<EstudianteRow[]>(
        "SELECT * FROM estudiantes WHERE institution_id = ? ORDER BY nombre_completo",
        [institutionId]
    );
    if (!rows.length) return [];

    const enrollRows = await db.select<EnrollRow[]>(
        `SELECT ea.estudiante_id, ea.asignatura_id, a.nombre, a.grupo, a.seccion, a.año
         FROM estudiante_asignaturas ea
         JOIN asignaturas a ON a.id = ea.asignatura_id
         WHERE ea.estudiante_id IN (${rows.map(() => "?").join(",")})`,
        rows.map((r) => r.id)
    );

    return rows.map((r) => ({
        id: r.id,
        nombreCompleto: r.nombre_completo,
        cedula: r.cedula,
        fechaNacimiento: r.fecha_nacimiento ?? "",
        telefonoEstudiante: r.telefono_estudiante ?? "",
        tutores: rowToTutores(r),
        adecuacion: r.adecuacion as Estudiante["adecuacion"],
        asignaturas: enrollRows
            .filter((e) => e.estudiante_id === r.id)
            .map((e): AsigRef => ({
                id: e.asignatura_id, nombre: e.nombre, grupo: parseInt(String(e.grupo), 10) || 0, seccion: parseInt(String(e.seccion), 10) || 0, año: e.año,
            })),
    }));
}

export async function insertEstudiante(
    institutionId: number,
    data: EstudianteFormData
): Promise<Estudiante> {
    const db = await getDb();
    const id = genId();
    const t1 = data.tutores[0];
    const t2 = data.tutores[1] ?? null;
    await db.execute(
        `INSERT INTO estudiantes
            (id, institution_id, nombre_completo, cedula, adecuacion, fecha_nacimiento,
             telefono_estudiante, tutor1_nombre, tutor1_telefono, tutor2_nombre, tutor2_telefono)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, institutionId, data.nombreCompleto, data.cedula, data.adecuacion,
         data.fechaNacimiento, data.telefonoEstudiante,
         t1?.nombre ?? "", t1?.telefono ?? "",
         t2?.nombre ?? "", t2?.telefono ?? ""]
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
    const t1 = data.tutores[0];
    const t2 = data.tutores[1] ?? null;
    await db.execute(
        `UPDATE estudiantes SET
            nombre_completo=?, cedula=?, adecuacion=?, fecha_nacimiento=?,
            telefono_estudiante=?, tutor1_nombre=?, tutor1_telefono=?,
            tutor2_nombre=?, tutor2_telefono=?
         WHERE id=?`,
        [data.nombreCompleto, data.cedula, data.adecuacion, data.fechaNacimiento,
         data.telefonoEstudiante,
         t1?.nombre ?? "", t1?.telefono ?? "",
         t2?.nombre ?? "", t2?.telefono ?? "",
         id]
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
