import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import { fetchAsignaturas, insertAsignatura } from "../../subjects/services/subjects.service";
import type { AsigRef, Estudiante, EstudianteFormData, ImportedStudentRow, Tutor } from "../types";

type EstudianteRow = {
    id: string;
    institution_id: number;
    full_name: string;
    national_id: string;
    accommodation: string;
    birth_date: string;
    guardian1_name: string;
    guardian1_phone: string;
    guardian2_name: string;
    guardian2_phone: string;
};

type EnrollRow = {
    student_id: string;
    subject_id: string;
    name: string;
    group_name: string;
    section: number;
    year: number;
};

function rowToTutores(row: EstudianteRow): Tutor[] {
    const tutores: Tutor[] = [];
    if (row.guardian1_name || row.guardian1_phone) {
        tutores.push({ nombre: row.guardian1_name ?? "", telefono: normalizePhone8(row.guardian1_phone ?? "") });
    }
    if (row.guardian2_name || row.guardian2_phone) {
        tutores.push({ nombre: row.guardian2_name ?? "", telefono: normalizePhone8(row.guardian2_phone ?? "") });
    }
    return tutores;
}

function normalizeCedula(value: string) {
    return value.trim().toLowerCase();
}

function normalizeName(value: string) {
    return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSheetName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePhone8(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return "";
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

async function ensureAsignaturasFromImport(
    institutionId: number,
    rows: ImportedStudentRow[],
    defaultLecciones: number
) {
    const currentAsignaturas = await fetchAsignaturas(institutionId);
    const keys = new Set<string>();

    for (const row of rows) {
        const key = `${normalizeSheetName(row.hojaNombre)}|${row.grupo}|${row.seccion}`;
        if (keys.has(key)) continue;
        keys.add(key);

        const sameGroup = currentAsignaturas.filter(
            (asignatura) => asignatura.grupo === row.grupo && asignatura.seccion === row.seccion
        );
        if (sameGroup.length > 0) continue;

        const created = await insertAsignatura(institutionId, {
            year: new Date().getFullYear(),
            nombre: row.hojaNombre.trim() || `Grupo ${row.grupo}`,
            grupo: row.grupo,
            seccion: row.seccion,
            lecciones: Math.max(1, defaultLecciones || 1),
        });
        console.log("[students/import] Asignatura creada desde hoja", {
            hoja: row.hojaNombre,
            asignaturaId: created.id,
            nombre: created.nombre,
            grupo: created.grupo,
            seccion: created.seccion,
        });
        currentAsignaturas.push(created);
    }

    return currentAsignaturas.map((asignatura) => ({
        id: asignatura.id,
        nombre: asignatura.nombre,
        grupo: asignatura.grupo,
        seccion: asignatura.seccion,
        year: asignatura.year,
    }));
}

export async function fetchEstudiantes(institutionId: number): Promise<Estudiante[]> {
    const db = await getDb();
    const rows = await db.select<EstudianteRow[]>(
        "SELECT id, institution_id, full_name, national_id, accommodation, birth_date, guardian1_name, guardian1_phone, guardian2_name, guardian2_phone FROM students WHERE institution_id = ? ORDER BY full_name",
        [institutionId]
    );
    if (!rows.length) return [];

    const enrollRows = await db.select<EnrollRow[]>(
        `SELECT e.student_id, e.subject_id, s.name, s.group_name, s.section, s.year
         FROM student_subject_enrollments e
         JOIN subjects s ON s.id = e.subject_id
         WHERE e.student_id IN (${rows.map(() => "?").join(",")})`,
        rows.map((row) => row.id)
    );

    return rows.map((row) => ({
        id: row.id,
        nombreCompleto: row.full_name,
        cedula: row.national_id,
        fechaNacimiento: row.birth_date ?? "",
        tutores: rowToTutores(row),
        adecuacion: row.accommodation as Estudiante["adecuacion"],
        asignaturas: enrollRows
            .filter((enroll) => enroll.student_id === row.id)
            .map((enroll): AsigRef => ({
                id: enroll.subject_id,
                nombre: enroll.name,
                grupo: parseInt(String(enroll.group_name), 10) || 0,
                seccion: parseInt(String(enroll.section), 10) || 0,
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
    const tutorOne = data.tutores[0]
        ? { ...data.tutores[0], nombre: data.tutores[0].nombre.normalize("NFC"), telefono: normalizePhone8(data.tutores[0].telefono) }
        : undefined;
    const tutorTwo = data.tutores[1]
        ? { ...data.tutores[1], nombre: data.tutores[1].nombre.normalize("NFC"), telefono: normalizePhone8(data.tutores[1].telefono) }
        : null;
    const normalizedName = data.nombreCompleto.normalize("NFC");

    await db.execute(
        `INSERT INTO students
            (id, institution_id, full_name, national_id, accommodation, birth_date,
             guardian1_name, guardian1_phone, guardian2_name, guardian2_phone)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
            id,
            institutionId,
            normalizedName,
            data.cedula,
            data.adecuacion,
            data.fechaNacimiento,
            tutorOne?.nombre ?? "",
            tutorOne?.telefono ?? "",
            tutorTwo?.nombre ?? "",
            tutorTwo?.telefono ?? "",
        ]
    );

    for (const asignatura of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO student_subject_enrollments (student_id, subject_id) VALUES (?,?)",
            [id, asignatura.id]
        );
    }

    return {
        id,
        ...data,
        nombreCompleto: normalizedName,
        tutores: [tutorOne, tutorTwo].filter((tutor): tutor is Tutor => Boolean(tutor && (tutor.nombre || tutor.telefono))),
    };
}

export async function updateEstudiante(id: string, data: EstudianteFormData): Promise<void> {
    const db = await getDb();
    const tutorOne = data.tutores[0]
        ? { ...data.tutores[0], nombre: data.tutores[0].nombre.normalize("NFC"), telefono: normalizePhone8(data.tutores[0].telefono) }
        : undefined;
    const tutorTwo = data.tutores[1]
        ? { ...data.tutores[1], nombre: data.tutores[1].nombre.normalize("NFC"), telefono: normalizePhone8(data.tutores[1].telefono) }
        : null;
    const normalizedName = data.nombreCompleto.normalize("NFC");

    await db.execute(
        `UPDATE students SET
            full_name=?, national_id=?, accommodation=?, birth_date=?,
            guardian1_name=?, guardian1_phone=?, guardian2_name=?, guardian2_phone=?
         WHERE id=?`,
        [
            normalizedName,
            data.cedula,
            data.adecuacion,
            data.fechaNacimiento,
            tutorOne?.nombre ?? "",
            tutorOne?.telefono ?? "",
            tutorTwo?.nombre ?? "",
            tutorTwo?.telefono ?? "",
            id,
        ]
    );

    await db.execute("DELETE FROM student_subject_enrollments WHERE student_id=?", [id]);
    for (const asignatura of data.asignaturas) {
        await db.execute(
            "INSERT OR IGNORE INTO student_subject_enrollments (student_id, subject_id) VALUES (?,?)",
            [id, asignatura.id]
        );
    }
}

export async function deleteEstudiante(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM students WHERE id=?", [id]);
}

export async function deleteEstudiantes(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await getDb();
    const placeholders = ids.map(() => "?").join(",");
    await db.execute(
        `DELETE FROM students WHERE id IN (${placeholders})`,
        ids
    );
}

export async function assignAsignaturaToEstudiantes(
    studentIds: string[],
    asignaturaId: string
): Promise<void> {
    if (!studentIds.length || !asignaturaId) return;
    const db = await getDb();
    for (const studentId of studentIds) {
        await db.execute(
            "INSERT OR IGNORE INTO student_subject_enrollments (student_id, subject_id) VALUES (?,?)",
            [studentId, asignaturaId]
        );
    }
}

export async function importEstudiantesFromRows(
    institutionId: number,
    rows: ImportedStudentRow[],
    asignaturas: AsigRef[],
    defaultLecciones: number
): Promise<void> {
    const asignaturasDisponibles = asignaturas.length > 0
        ? [...asignaturas, ...(await ensureAsignaturasFromImport(institutionId, rows, defaultLecciones)).filter(
            (candidate) => !asignaturas.some((current) => current.id === candidate.id)
        )]
        : await ensureAsignaturasFromImport(institutionId, rows, defaultLecciones);

    const existingStudents = await fetchEstudiantes(institutionId);
    const byCedula = new Map<string, Estudiante>();
    const byNameAndBirth = new Map<string, Estudiante>();

    for (const student of existingStudents) {
        const cedulaKey = normalizeCedula(student.cedula);
        const nameKey = `${normalizeName(student.nombreCompleto)}|${student.fechaNacimiento}`;
        if (cedulaKey) byCedula.set(cedulaKey, student);
        byNameAndBirth.set(nameKey, student);
    }

    for (const row of rows) {
        const matchingAsignaturas = asignaturasDisponibles.filter(
            (asignatura) => asignatura.grupo === row.grupo && asignatura.seccion === row.seccion
        );
        const tutor = {
            nombre: row.encargadoLegal.trim(),
            telefono: row.telefonoEncargadoLegal.trim(),
        };
        const payload: EstudianteFormData = {
            nombreCompleto: row.nombreCompleto.trim(),
            cedula: row.cedula.trim(),
            fechaNacimiento: row.fechaNacimiento,
            tutores: tutor.nombre || tutor.telefono ? [tutor] : [],
            adecuacion: "no_tiene",
            asignaturas: matchingAsignaturas,
        };

        const cedulaKey = normalizeCedula(payload.cedula);
        const nameKey = `${normalizeName(payload.nombreCompleto)}|${payload.fechaNacimiento}`;
        const existing = (cedulaKey && byCedula.get(cedulaKey)) || byNameAndBirth.get(nameKey);

        if (existing) {
            await updateEstudiante(existing.id, {
                ...existing,
                ...payload,
                tutores: payload.tutores.length > 0 ? payload.tutores : existing.tutores,
                asignaturas: payload.asignaturas.length > 0 ? payload.asignaturas : existing.asignaturas,
            });
            const nextStudent: Estudiante = {
                ...existing,
                ...payload,
                tutores: payload.tutores.length > 0 ? payload.tutores : existing.tutores,
                asignaturas: payload.asignaturas.length > 0 ? payload.asignaturas : existing.asignaturas,
            };
            if (cedulaKey) byCedula.set(cedulaKey, nextStudent);
            byNameAndBirth.set(nameKey, nextStudent);
            continue;
        }

        const inserted = await insertEstudiante(institutionId, payload);
        if (cedulaKey) byCedula.set(cedulaKey, inserted);
        byNameAndBirth.set(nameKey, inserted);
    }
}
