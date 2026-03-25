import { getDb } from "../../shared/lib/db";
import { genId } from "../../shared/lib/genId";
import type { StudentEval, StudentCotidiano, TemaItem, EvalEntry, SemanaAsist, EvalCategory } from "./types";

type EvalRow   = { id: string; institution_id: number; asignatura_id: string; nombre: string; estudiante_id: string | null };
type EntryRow  = { id: string; evaluacion_id: string; category: string; nombre: string; pct: number };
type TemaRow   = { id: string; entry_id: string; tema: string; nombre: string; descripcion: string; valor: number; nota: number };
type AsistRow  = { id: string; evaluacion_id: string; semestre: string; semana: number; dias: string };
type EnrollRow = { estudiante_id: string; nombre_completo: string; asignatura_id: string };
type CotRow    = { estudiante_id: string; conducta_pct: number };

const ASIG_CATS: EvalCategory[] = ["cotidiano", "tareas", "prueba", "proyecto"];

function ph(n: number) { return Array(n).fill("?").join(","); }

// ─── Fetch evaluaciones ───────────────────────────────────────────────────────
export async function fetchEvaluaciones(institutionId: number): Promise<StudentEval[]> {
    const db = await getDb();

    const enrollments = await db.select<EnrollRow[]>(`
        SELECT e.id as estudiante_id, e.nombre_completo, ea.asignatura_id
        FROM estudiante_asignaturas ea
        JOIN estudiantes e ON e.id = ea.estudiante_id
        WHERE e.institution_id = ?
    `, [institutionId]);

    if (enrollments.length > 0) {
        const existing = await db.select<{ estudiante_id: string | null; asignatura_id: string }[]>(
            "SELECT estudiante_id, asignatura_id FROM evaluaciones WHERE institution_id = ?",
            [institutionId]
        );
        for (const enroll of enrollments) {
            const found = existing.some(
                (e) => e.estudiante_id === enroll.estudiante_id && e.asignatura_id === enroll.asignatura_id
            );
            if (!found) {
                await db.execute(
                    "INSERT INTO evaluaciones (id, institution_id, asignatura_id, nombre, estudiante_id) VALUES (?,?,?,?,?)",
                    [genId(), institutionId, enroll.asignatura_id, enroll.nombre_completo, enroll.estudiante_id]
                );
            }
        }
    }

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

    return rows.map((r): StudentEval => {
        const myEntries = entries.filter((e) => e.evaluacion_id === r.id);

        const toEntries = (cat: EvalCategory): EvalEntry[] =>
            myEntries.filter((e) => e.category === cat).map((e) => ({
                id: e.id, nombre: e.nombre, pct: e.pct,
                items: temas.filter((t) => t.entry_id === e.id).map((t) => ({
                    id: t.id, tema: t.tema, nombre: t.nombre,
                    descripcion: t.descripcion, valor: t.valor, nota: t.nota ?? 0,
                })),
            }));

        const toSemanas = (sem: string): SemanaAsist[] =>
            asist.filter((a) => a.evaluacion_id === r.id && a.semestre === sem)
                .map((a) => ({ id: a.id, semana: a.semana, dias: JSON.parse(a.dias) as boolean[] }));

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

// ─── Fetch student conducta ───────────────────────────────────────────────────
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

// ─── Update evaluacion categories / asistencia ───────────────────────────────
export async function updateEvaluacion(id: string, patch: Partial<StudentEval>): Promise<void> {
    const db = await getDb();

    if (ASIG_CATS.some((c) => c in patch)) {
        await db.execute("DELETE FROM eval_entries WHERE evaluacion_id=?", [id]);
        for (const cat of ASIG_CATS) {
            const entries = (patch as Record<string, EvalEntry[]>)[cat];
            if (!entries) continue;
            for (const entry of entries) {
                await db.execute(
                    "INSERT INTO eval_entries (id, evaluacion_id, category, nombre, pct) VALUES (?,?,?,?,?)",
                    [entry.id, id, cat, entry.nombre, entry.pct]
                );
                for (const item of entry.items) {
                    await db.execute(
                        "INSERT INTO eval_temas (id, entry_id, tema, nombre, descripcion, valor, nota) VALUES (?,?,?,?,?,?,?)",
                        [item.id, entry.id, item.tema, item.nombre, item.descripcion, item.valor, item.nota]
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

// ─── Batch-add an eval entry to multiple records ─────────────────────────────
export async function addEvalEntryBatch(
    recordIds: string[],
    category: EvalCategory,
    nombre: string,
    items: TemaItem[]
): Promise<{ recordId: string; entryId: string; items: TemaItem[] }[]> {
    const db = await getDb();
    const pct = items.reduce((s, i) => s + i.valor, 0);
    const result: { recordId: string; entryId: string; items: TemaItem[] }[] = [];
    for (const recordId of recordIds) {
        const entryId = genId();
        await db.execute(
            "INSERT INTO eval_entries (id, evaluacion_id, category, nombre, pct) VALUES (?,?,?,?,?)",
            [entryId, recordId, category, nombre, pct]
        );
        const savedItems: TemaItem[] = [];
        for (const item of items) {
            const itemId = genId();
            await db.execute(
                "INSERT INTO eval_temas (id, entry_id, tema, nombre, descripcion, valor, nota) VALUES (?,?,?,?,?,?,?)",
                [itemId, entryId, item.tema, item.nombre, item.descripcion, item.valor, 0]
            );
            savedItems.push({ ...item, id: itemId, nota: 0 });
        }
        result.push({ recordId, entryId, items: savedItems });
    }
    return result;
}

// ─── Update student conducta % ────────────────────────────────────────────────
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
