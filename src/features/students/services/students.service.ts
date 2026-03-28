import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { AsigRef, Estudiante, EstudianteFormData, Tutor } from "../types";

type EstudianteRow = {
    id: string;
    institution_id: number;
    nombre_completo: string;
    cedula: string;
    adecuacion: string;
    fecha_nacimiento: string;
    telefono_estudiante: string;
    tutor1_nombre: string;
    tutor1_telefono: string;
    tutor2_nombre: string;
    tutor2_telefono: string;
};

type EnrollRow = {
    estudiante_id: string;
    asignatura_id: string;
    nombre: string;
    grupo: string;
    seccion: number;
    year: number;
};

function rowToTutores(row: EstudianteRow): Tutor[] {
    const tutores: Tutor[] = [];
    if (row.tutor1_nombre || row.tutor1_telefono) {
        tutores.push({ nombre: row.tutor1_nombre ?? "", telefono: row.tutor1_telefono ?? "" });
    }
    if (row.tutor2_nombre || row.tutor2_telefono) {
        tutores.push({ nombre: row.tutor2_nombre ?? "", telefono: row.tutor2_telefono ?? "" });
    }
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
        `SELECT ea.estudiante_id, ea.asignatura_id, a.nombre, a.grupo, a.seccion, a."año" as year
         FROM estudiante_asignaturas ea
         JOIN asignaturas a ON a.id = ea.asignatura_id
         WHERE ea.estudiante_id IN (${rows.map(() => "?").join(",")})`,
        rows.map((row) => row.id)
    );

    return rows.map((row) => ({
        id: row.id,
        nombreCompleto: row.nombre_completo,
        cedula: row.cedula,
        fechaNacimiento: row.fecha_nacimiento ?? "",
        telefonoEstudiante: row.telefono_estudiante ?? "",
        tutores: rowToTutores(row),
        adecuacion: row.adecuacion as Estudiante["adecuacion"],
        asignaturas: enrollRows
            .filter((enroll) => enroll.estudiante_id === row.id)
            .map((enroll): AsigRef => ({
                id: enroll.asignatura_id,
                nombre: enroll.nombre,
                grupo: parseInt(String(enroll.grupo), 10) || 0,
                seccion: parseInt(String(enroll.seccion), 10) || 0,
                year: enroll.year,
            })),
    }));
}

export async function insertEstudiante(
    institutionId: number,
    data: EstudianteFormData
): Promise<Estudiante> {
    const db = await getDb();
    const id = genId();
    const tutorOne = data.tutores[0];
    const tutorTwo = data.tutores[1] ?? null;

    await db.execute(
        `INSERT INTO estudiantes
            (id, institution_id, nombre_completo, cedula, adecuacion, fecha_nacimiento,
             telefono_estudiante, tutor1_nombre, tutor1_telefono, tutor2_nombre, tutor2_telefono)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
            id,
            institutionId,
            data.nombreCompleto,
            data.cedula,
            data.adecuacion,
            data.fechaNacimiento,
            data.telefonoEstudiante,
            tutorOne?.nombre ?? "",
            tutorOne?.telefono ?? "",
            tutorTwo?.nombre ?? "",
            tutorTwo?.telefono ?? "",
        ]
    );

    for (const asignatura of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES (?,?)",
            [id, asignatura.id]
        );
    }

    return { id, ...data };
}

export async function updateEstudiante(id: string, data: EstudianteFormData): Promise<void> {
    const db = await getDb();
    const tutorOne = data.tutores[0];
    const tutorTwo = data.tutores[1] ?? null;

    await db.execute(
        `UPDATE estudiantes SET
            nombre_completo=?, cedula=?, adecuacion=?, fecha_nacimiento=?,
            telefono_estudiante=?, tutor1_nombre=?, tutor1_telefono=?,
            tutor2_nombre=?, tutor2_telefono=?
         WHERE id=?`,
        [
            data.nombreCompleto,
            data.cedula,
            data.adecuacion,
            data.fechaNacimiento,
            data.telefonoEstudiante,
            tutorOne?.nombre ?? "",
            tutorOne?.telefono ?? "",
            tutorTwo?.nombre ?? "",
            tutorTwo?.telefono ?? "",
            id,
        ]
    );

    await db.execute("DELETE FROM estudiante_asignaturas WHERE estudiante_id=?", [id]);
    for (const asignatura of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO estudiante_asignaturas (estudiante_id, asignatura_id) VALUES (?,?)",
            [id, asignatura.id]
        );
    }
}

export async function deleteEstudiante(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM evaluaciones WHERE estudiante_id = ?", [id]);
    await db.execute("DELETE FROM estudiantes WHERE id=?", [id]);
}
