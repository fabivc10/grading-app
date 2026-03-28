import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { StudentEval, StudentCotidiano, TemaItem, EvalEntry, EvalTipo, SemanaAsist, EvalCategory } from "../types";
import type { AttendanceMark } from "../../attendance/utils/attendance.utils";

type EvalRow   = { id: string; institution_id: number; asignatura_id: string; nombre: string; estudiante_id: string | null };
type EntryRow  = { id: string; evaluacion_id: string; category: string; nombre: string; pct: number; semestre: string; tipo: string };
type TemaRow   = { id: string; entry_id: string; tema: string; nombre: string; descripcion: string; valor: number; nota: number; nota_descripcion: string };
type AsistRow  = { id: string; evaluacion_id: string; semestre: string; semana: number; dias: string };
type AsistWeekRow = { id: string; asignatura_id: string; semestre: string; inicio_date: string };
type AsistDayRow = { semana_id: string; estudiante_id: string; l: string | null; m: string | null; x: string | null; j: string | null; v: string | null };
type EnrollRow = { estudiante_id: string; nombre_completo: string; asignatura_id: string };
type CotRow    = { estudiante_id: string; conducta_pct: number };

const ASIG_CATS: EvalCategory[] = ["cotidiano", "tareas", "prueba", "proyecto"];

function ph(n: number) { return Array(n).fill("?").join(","); }

async function syncEvaluacionesWithEnrollments(institutionId: number): Promise<void> {
    const db = await getDb();

    const enrollments = await db.select<EnrollRow[]>(`
        SELECT e.id as estudiante_id, e.nombre_completo, ea.asignatura_id
        FROM estudiante_asignaturas ea
        JOIN estudiantes e ON e.id = ea.estudiante_id
        WHERE e.institution_id = ?
    `, [institutionId]);

    const existing = await db.select<{ id: string; estudiante_id: string | null; asignatura_id: string; nombre: string }[]>(
        "SELECT id, estudiante_id, asignatura_id, nombre FROM evaluaciones WHERE institution_id = ?",
        [institutionId]
    );

    const enrollmentKeySet = new Set(
        enrollments.map((enroll) => `${enroll.estudiante_id}::${enroll.asignatura_id}`)
    );

    for (const record of existing) {
        if (!record.estudiante_id) continue;

        const key = `${record.estudiante_id}::${record.asignatura_id}`;
        if (!enrollmentKeySet.has(key)) {
            await db.execute("DELETE FROM evaluaciones WHERE id = ?", [record.id]);
        }
    }

    const existingMap = new Map(
        existing
            .filter((record) => Boolean(record.estudiante_id))
            .map((record) => [`${record.estudiante_id}::${record.asignatura_id}`, record])
    );

    for (const enroll of enrollments) {
        const key = `${enroll.estudiante_id}::${enroll.asignatura_id}`;
        const found = existingMap.get(key);

        if (!found) {
            await db.execute(
                "INSERT INTO evaluaciones (id, institution_id, asignatura_id, nombre, estudiante_id) VALUES (?,?,?,?,?)",
                [genId(), institutionId, enroll.asignatura_id, enroll.nombre_completo, enroll.estudiante_id]
            );
            continue;
        }

        if (found.nombre !== enroll.nombre_completo) {
            await db.execute(
                "UPDATE evaluaciones SET nombre = ? WHERE id = ?",
                [enroll.nombre_completo, found.id]
            );
        }
    }
}

// â”€â”€â”€ Fetch evaluaciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchEvaluaciones(institutionId: number): Promise<StudentEval[]> {
    await syncEvaluacionesWithEnrollments(institutionId);

    const db = await getDb();

    const rows = await db.select<EvalRow[]>(
        "SELECT id, institution_id, asignatura_id, nombre, estudiante_id FROM evaluaciones WHERE institution_id = ?",
        [institutionId]
    );
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const entries = await db.select<EntryRow[]>(
        `SELECT * FROM eval_entries WHERE evaluacion_id IN (${ph(ids.length)})`, ids
    );

    let temas: TemaRow[] = [];
    if (entries.length > 0) {
        const eids = entries.map((e) => e.id);
        temas = await db.select<TemaRow[]>(
            `SELECT * FROM eval_temas WHERE entry_id IN (${ph(eids.length)})`, eids
        );
    }

    const asist = await db.select<AsistRow[]>(
        `SELECT * FROM eval_asistencia WHERE evaluacion_id IN (${ph(ids.length)})`, ids
    );

    const asigIds = [...new Set(rows.map((r) => r.asignatura_id))];
    let asistenciaWeeks: AsistWeekRow[] = [];
    let asistenciaDays: AsistDayRow[] = [];
    if (asigIds.length > 0) {
        asistenciaWeeks = await db.select<AsistWeekRow[]>(
            `SELECT id, asignatura_id, semestre, inicio_date FROM asistencia_semanas WHERE asignatura_id IN (${ph(asigIds.length)})`,
            asigIds
        );

        if (asistenciaWeeks.length > 0) {
            const weekIds = asistenciaWeeks.map((week) => week.id);
            asistenciaDays = await db.select<AsistDayRow[]>(
                `SELECT semana_id, estudiante_id, l, m, x, j, v FROM asistencia_dias WHERE semana_id IN (${ph(weekIds.length)})`,
                weekIds
            );
        }
    }

    return rows.map((r): StudentEval => {
        const myEntries = entries.filter((e) => e.evaluacion_id === r.id);

        const toEntries = (cat: EvalCategory): EvalEntry[] =>
            myEntries.filter((e) => e.category === cat).map((e) => ({
                id: e.id, nombre: e.nombre, pct: e.pct,
                semestre: ((e.semestre as string) === 's2' ? 's2' : 's1') as 's1' | 's2',
                tipo: (e.tipo || "numerica") as EvalTipo,
                items: temas.filter((t) => t.entry_id === e.id).map((t) => ({
                    id: t.id, tema: t.tema, nombre: t.nombre,
                    descripcion: t.descripcion, valor: t.valor, nota: t.nota ?? t.valor,
                    notaDescripcion: t.nota_descripcion ?? "",
                })),
            }));

        const toSemanas = (sem: string): SemanaAsist[] => {
            const liveWeeks = r.estudiante_id
                ? asistenciaWeeks
                    .filter((week) => week.asignatura_id === r.asignatura_id && week.semestre === sem)
                    .sort((a, b) => a.inicio_date.localeCompare(b.inicio_date))
                    .flatMap((week, index) => {
                        const dayRow = asistenciaDays.find((day) =>
                            day.semana_id === week.id && day.estudiante_id === r.estudiante_id
                        );
                        if (!dayRow) return [];
                        return [{
                            id: week.id,
                            semana: index + 1,
                            dias: [dayRow.l, dayRow.m, dayRow.x, dayRow.j, dayRow.v] as AttendanceMark[],
                        }];
                    })
                : [];

            if (liveWeeks.length > 0) return liveWeeks;

            return asist
                .filter((a) => a.evaluacion_id === r.id && a.semestre === sem)
                .map((a) => ({ id: a.id, semana: a.semana, dias: JSON.parse(a.dias) as AttendanceMark[] }));
        };

        return {
            id: r.id, nombre: r.nombre,
            asignaturaId: r.asignatura_id,
            estudianteId: r.estudiante_id ?? undefined,
            cotidiano: toEntries("cotidiano"),
            tareas:    toEntries("tareas"),
            prueba:    toEntries("prueba"),
            proyecto:  toEntries("proyecto"),
            asistencia: { s1: toSemanas("s1"), s2: toSemanas("s2") },
        };
    });
}

// â”€â”€â”€ Fetch student conducta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchStudentCotidianos(institutionId: number): Promise<StudentCotidiano[]> {
    const db = await getDb();
    const students = await db.select<{ id: string }[]>(
        "SELECT id FROM estudiantes WHERE institution_id = ?", [institutionId]
    );
    if (!students.length) return [];
    for (const s of students) {
        await db.execute(
            "INSERT OR IGNORE INTO student_cotidiano (estudiante_id, conducta_pct) VALUES (?,?)",
            [s.id, 100]
        );
    }
    const sids = students.map((s) => s.id);
    const rows = await db.select<CotRow[]>(
        `SELECT * FROM student_cotidiano WHERE estudiante_id IN (${ph(sids.length)})`, sids
    );
    return rows.map((c) => ({ estudianteId: c.estudiante_id, conductaPct: c.conducta_pct ?? 100 }));
}

// â”€â”€â”€ Update evaluacion categories / asistencia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function updateEvaluacion(id: string, patch: Partial<StudentEval>): Promise<void> {
    const db = await getDb();

    if (ASIG_CATS.some((c) => c in patch)) {
        await db.execute("DELETE FROM eval_entries WHERE evaluacion_id=?", [id]);
        for (const cat of ASIG_CATS) {
            const entries = (patch as Record<string, EvalEntry[]>)[cat];
            if (!entries) continue;
            for (const entry of entries) {
                await db.execute(
                    "INSERT INTO eval_entries (id, evaluacion_id, category, nombre, pct, semestre, tipo) VALUES (?,?,?,?,?,?,?)",
                    [entry.id, id, cat, entry.nombre, entry.pct, entry.semestre ?? 's1', entry.tipo ?? 'numerica']
                );
                for (const item of entry.items) {
                    await db.execute(
                        "INSERT INTO eval_temas (id, entry_id, tema, nombre, descripcion, valor, nota, nota_descripcion) VALUES (?,?,?,?,?,?,?,?)",
                        [item.id, entry.id, item.tema, item.nombre, item.descripcion, item.valor, item.nota, item.notaDescripcion ?? ""]
                    );
                }
            }
        }
    }

    if (patch.asistencia) {
        await db.execute("DELETE FROM eval_asistencia WHERE evaluacion_id=?", [id]);
        for (const [sem, semanas] of [["s1", patch.asistencia.s1], ["s2", patch.asistencia.s2]] as [string, SemanaAsist[]][]) {
            for (const s of semanas) {
                await db.execute(
                    "INSERT INTO eval_asistencia (id, evaluacion_id, semestre, semana, dias) VALUES (?,?,?,?,?)",
                    [s.id ?? genId(), id, sem, s.semana, JSON.stringify(s.dias)]
                );
            }
        }
    }
}

// â”€â”€â”€ Batch-add an eval entry to multiple records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function addEvalEntryBatch(
    recordIds: string[],
    category: EvalCategory,
    nombre: string,
    items: TemaItem[],
    semestre: 's1' | 's2',
    tipo: EvalTipo = 'numerica'
): Promise<{ recordId: string; entryId: string; items: TemaItem[] }[]> {
    const db = await getDb();
    const pct = items.reduce((s, i) => s + i.valor, 0);
    const result: { recordId: string; entryId: string; items: TemaItem[] }[] = [];
    for (const recordId of recordIds) {
        const entryId = genId();
        await db.execute(
            "INSERT INTO eval_entries (id, evaluacion_id, category, nombre, pct, semestre, tipo) VALUES (?,?,?,?,?,?,?)",
            [entryId, recordId, category, nombre, pct, semestre, tipo]
        );
        const savedItems: TemaItem[] = [];
        for (const item of items) {
            const itemId = genId();
            await db.execute(
                "INSERT INTO eval_temas (id, entry_id, tema, nombre, descripcion, valor, nota, nota_descripcion) VALUES (?,?,?,?,?,?,?,?)",
                [itemId, entryId, item.tema, item.nombre, item.descripcion, item.valor, item.valor, ""]
            );
            savedItems.push({ ...item, id: itemId, nota: item.valor, notaDescripcion: "" });
        }
        result.push({ recordId, entryId, items: savedItems });
    }
    return result;
}

// â”€â”€â”€ Update student conducta % â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function updateStudentCotidiano(estudianteId: string, patch: Partial<StudentCotidiano>): Promise<void> {
    const db = await getDb();
    if (patch.conductaPct !== undefined) {
        await db.execute(
            "UPDATE student_cotidiano SET conducta_pct = ? WHERE estudiante_id = ?",
            [patch.conductaPct, estudianteId]
        );
    }
}

export async function insertEvaluacion(institutionId: number, r: StudentEval): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO evaluaciones (id, institution_id, asignatura_id, nombre, estudiante_id) VALUES (?,?,?,?,?)",
        [r.id, institutionId, r.asignaturaId, r.nombre, r.estudianteId ?? null]
    );
}

export async function deleteEvaluacion(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM evaluaciones WHERE id=?", [id]);
}
