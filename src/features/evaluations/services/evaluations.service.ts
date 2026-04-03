import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { StudentEval, StudentCotidiano, TemaItem, EvalEntry, EvalTipo, SemanaAsist, EvalCategory } from "../types";
import type { AttendanceMark } from "../../attendance/utils/attendance.utils";

type EvalRow = { id: string; institution_id: number; subject_id: string; name: string; student_id: string | null };
type EntryRow = { id: string; evaluation_id: string; category: string; name: string; pct: number; term: string; scale_type: string };
type TemaRow = { id: string; entry_id: string; topic: string; name: string; description: string; max_points: number; score: number; score_note: string };
type AsistRow = { id: string; evaluation_id: string; term: string; week_number: number; days: string };
type AsistWeekRow = { id: string; subject_id: string; term: string; start_date: string };
type AsistDayRow = {
    week_id: string;
    student_id: string;
    monday: string | null;
    tuesday: string | null;
    wednesday: string | null;
    thursday: string | null;
    friday: string | null;
};
type EnrollRow = { student_id: string; full_name: string; subject_id: string };
type CotRow = { student_id: string; conduct_pct: number };

const ASIG_CATS: EvalCategory[] = ["cotidiano", "tareas", "prueba", "proyecto"];

function ph(n: number) { return Array(n).fill("?").join(","); }

async function syncEvaluacionesWithEnrollments(institutionId: number): Promise<void> {
    const db = await getDb();

    const enrollments = await db.select<EnrollRow[]>(`
        SELECT s.id as student_id, s.full_name, e.subject_id
        FROM student_subject_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE s.institution_id = ?
    `, [institutionId]);

    const existing = await db.select<{ id: string; student_id: string | null; subject_id: string; name: string }[]>(
        "SELECT id, student_id, subject_id, name FROM student_evaluations WHERE institution_id = ?",
        [institutionId]
    );

    const enrollmentKeySet = new Set(
        enrollments.map((enroll) => `${enroll.student_id}::${enroll.subject_id}`)
    );

    for (const record of existing) {
        if (!record.student_id) continue;

        const key = `${record.student_id}::${record.subject_id}`;
        if (!enrollmentKeySet.has(key)) {
            await db.execute("DELETE FROM student_evaluations WHERE id = ?", [record.id]);
        }
    }

    const existingMap = new Map(
        existing
            .filter((record) => Boolean(record.student_id))
            .map((record) => [`${record.student_id}::${record.subject_id}`, record])
    );

    for (const enroll of enrollments) {
        const key = `${enroll.student_id}::${enroll.subject_id}`;
        const found = existingMap.get(key);

        if (!found) {
            await db.execute(
                "INSERT INTO student_evaluations (id, institution_id, subject_id, name, student_id) VALUES (?,?,?,?,?)",
                [genId(), institutionId, enroll.subject_id, enroll.full_name, enroll.student_id]
            );
            continue;
        }

        if (found.name !== enroll.full_name) {
            await db.execute(
                "UPDATE student_evaluations SET name = ? WHERE id = ?",
                [enroll.full_name, found.id]
            );
        }
    }
}

export async function fetchEvaluaciones(institutionId: number): Promise<StudentEval[]> {
    await syncEvaluacionesWithEnrollments(institutionId);

    const db = await getDb();

    const rows = await db.select<EvalRow[]>(
        "SELECT id, institution_id, subject_id, name, student_id FROM student_evaluations WHERE institution_id = ?",
        [institutionId]
    );
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const entries = await db.select<EntryRow[]>(
        `SELECT id, evaluation_id, category, name, pct, term, scale_type FROM evaluation_entries WHERE evaluation_id IN (${ph(ids.length)})`,
        ids
    );

    let temas: TemaRow[] = [];
    if (entries.length > 0) {
        const eids = entries.map((e) => e.id);
        temas = await db.select<TemaRow[]>(
            `SELECT id, entry_id, topic, name, description, max_points, score, score_note FROM evaluation_items WHERE entry_id IN (${ph(eids.length)})`,
            eids
        );
    }

    const asist = await db.select<AsistRow[]>(
        `SELECT id, evaluation_id, term, week_number, days FROM evaluation_attendance WHERE evaluation_id IN (${ph(ids.length)})`,
        ids
    );

    const subjectIds = [...new Set(rows.map((r) => r.subject_id))];
    let attendanceWeeks: AsistWeekRow[] = [];
    let attendanceDays: AsistDayRow[] = [];
    if (subjectIds.length > 0) {
        attendanceWeeks = await db.select<AsistWeekRow[]>(
            `SELECT id, subject_id, term, start_date FROM attendance_weeks WHERE subject_id IN (${ph(subjectIds.length)})`,
            subjectIds
        );

        if (attendanceWeeks.length > 0) {
            const weekIds = attendanceWeeks.map((week) => week.id);
            attendanceDays = await db.select<AsistDayRow[]>(
                `SELECT week_id, student_id, monday, tuesday, wednesday, thursday, friday FROM attendance_days WHERE week_id IN (${ph(weekIds.length)})`,
                weekIds
            );
        }
    }

    return rows.map((r): StudentEval => {
        const myEntries = entries.filter((e) => e.evaluation_id === r.id);

        const toEntries = (cat: EvalCategory): EvalEntry[] =>
            myEntries.filter((e) => e.category === cat).map((e) => ({
                id: e.id,
                nombre: e.name,
                pct: e.pct,
                semestre: ((e.term as string) === "s2" ? "s2" : "s1") as "s1" | "s2",
                tipo: (e.scale_type || "numerica") as EvalTipo,
                items: temas.filter((t) => t.entry_id === e.id).map((t) => ({
                    id: t.id,
                    tema: t.topic,
                    nombre: t.name,
                    descripcion: t.description,
                    valor: t.max_points,
                    nota: t.score ?? t.max_points,
                    notaDescripcion: t.score_note ?? "",
                })),
            }));

        const toSemanas = (sem: string): SemanaAsist[] => {
            const liveWeeks = r.student_id
                ? attendanceWeeks
                    .filter((week) => week.subject_id === r.subject_id && week.term === sem)
                    .sort((a, b) => a.start_date.localeCompare(b.start_date))
                    .flatMap((week, index) => {
                        const dayRow = attendanceDays.find((day) =>
                            day.week_id === week.id && day.student_id === r.student_id
                        );
                        if (!dayRow) return [];
                        return [{
                            id: week.id,
                            semana: index + 1,
                            dias: [dayRow.monday, dayRow.tuesday, dayRow.wednesday, dayRow.thursday, dayRow.friday] as AttendanceMark[],
                        }];
                    })
                : [];

            if (liveWeeks.length > 0) return liveWeeks;

            return asist
                .filter((a) => a.evaluation_id === r.id && a.term === sem)
                .map((a) => ({ id: a.id, semana: a.week_number, dias: JSON.parse(a.days) as AttendanceMark[] }));
        };

        return {
            id: r.id,
            nombre: r.name,
            asignaturaId: r.subject_id,
            estudianteId: r.student_id ?? undefined,
            cotidiano: toEntries("cotidiano"),
            tareas: toEntries("tareas"),
            prueba: toEntries("prueba"),
            proyecto: toEntries("proyecto"),
            asistencia: { s1: toSemanas("s1"), s2: toSemanas("s2") },
        };
    });
}

export async function fetchStudentCotidianos(institutionId: number): Promise<StudentCotidiano[]> {
    const db = await getDb();
    const students = await db.select<{ id: string }[]>(
        "SELECT id FROM students WHERE institution_id = ?",
        [institutionId]
    );
    if (!students.length) return [];
    for (const s of students) {
        await db.execute(
            "INSERT OR IGNORE INTO student_conduct (student_id, conduct_pct) VALUES (?,?)",
            [s.id, 100]
        );
    }
    const sids = students.map((s) => s.id);
    const rows = await db.select<CotRow[]>(
        `SELECT student_id, conduct_pct FROM student_conduct WHERE student_id IN (${ph(sids.length)})`,
        sids
    );
    return rows.map((c) => ({ estudianteId: c.student_id, conductaPct: c.conduct_pct ?? 100 }));
}

export async function updateEvaluacion(id: string, patch: Partial<StudentEval>): Promise<void> {
    const db = await getDb();

    if (ASIG_CATS.some((c) => c in patch)) {
        await db.execute("DELETE FROM evaluation_entries WHERE evaluation_id=?", [id]);
        for (const cat of ASIG_CATS) {
            const entries = (patch as Record<string, EvalEntry[]>)[cat];
            if (!entries) continue;
            for (const entry of entries) {
                await db.execute(
                    "INSERT INTO evaluation_entries (id, evaluation_id, category, name, pct, term, scale_type) VALUES (?,?,?,?,?,?,?)",
                    [entry.id, id, cat, entry.nombre, entry.pct, entry.semestre ?? "s1", entry.tipo ?? "numerica"]
                );
                for (const item of entry.items) {
                    await db.execute(
                        "INSERT INTO evaluation_items (id, entry_id, topic, name, description, max_points, score, score_note) VALUES (?,?,?,?,?,?,?,?)",
                        [item.id, entry.id, item.tema, item.nombre, item.descripcion, item.valor, item.nota, item.notaDescripcion ?? ""]
                    );
                }
            }
        }
    }

    if (patch.asistencia) {
        await db.execute("DELETE FROM evaluation_attendance WHERE evaluation_id=?", [id]);
        for (const [sem, semanas] of [["s1", patch.asistencia.s1], ["s2", patch.asistencia.s2]] as [string, SemanaAsist[]][]) {
            for (const s of semanas) {
                await db.execute(
                    "INSERT INTO evaluation_attendance (id, evaluation_id, term, week_number, days) VALUES (?,?,?,?,?)",
                    [s.id ?? genId(), id, sem, s.semana, JSON.stringify(s.dias)]
                );
            }
        }
    }
}

export async function addEvalEntryBatch(
    recordIds: string[],
    category: EvalCategory,
    nombre: string,
    pct: number,
    items: TemaItem[],
    semestre: "s1" | "s2",
    tipo: EvalTipo = "numerica"
): Promise<{ recordId: string; entryId: string; items: TemaItem[] }[]> {
    const db = await getDb();
    const result: { recordId: string; entryId: string; items: TemaItem[] }[] = [];
    for (const recordId of recordIds) {
        const entryId = genId();
        await db.execute(
            "INSERT INTO evaluation_entries (id, evaluation_id, category, name, pct, term, scale_type) VALUES (?,?,?,?,?,?,?)",
            [entryId, recordId, category, nombre, pct, semestre, tipo]
        );
        const savedItems: TemaItem[] = [];
        for (const item of items) {
            const itemId = genId();
            await db.execute(
                "INSERT INTO evaluation_items (id, entry_id, topic, name, description, max_points, score, score_note) VALUES (?,?,?,?,?,?,?,?)",
                [itemId, entryId, item.tema, item.nombre, item.descripcion, item.valor, item.valor, ""]
            );
            savedItems.push({ ...item, id: itemId, nota: item.valor, notaDescripcion: "" });
        }
        result.push({ recordId, entryId, items: savedItems });
    }
    return result;
}

export async function updateStudentCotidiano(estudianteId: string, patch: Partial<StudentCotidiano>): Promise<void> {
    const db = await getDb();
    if (patch.conductaPct !== undefined) {
        await db.execute(
            "UPDATE student_conduct SET conduct_pct = ? WHERE student_id = ?",
            [patch.conductaPct, estudianteId]
        );
    }
}

export async function insertEvaluacion(institutionId: number, r: StudentEval): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO student_evaluations (id, institution_id, subject_id, name, student_id) VALUES (?,?,?,?,?)",
        [r.id, institutionId, r.asignaturaId, r.nombre, r.estudianteId ?? null]
    );
}

export async function deleteEvaluacion(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM student_evaluations WHERE id=?", [id]);
}
