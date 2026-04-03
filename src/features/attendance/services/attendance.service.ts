import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { AsistenciaSemana, AsistenciaDia, AsistStudent, DayKey, EstadoAsist, GlobalSemConfig } from "../types";

type SemanaRow = { id: string; subject_id: string; term: string; start_date: string };
type DiaRow = {
    id: string;
    week_id: string;
    student_id: string;
    monday: string | null;
    tuesday: string | null;
    wednesday: string | null;
    thursday: string | null;
    friday: string | null;
};
type EstRow = { id: string; full_name: string };

function ph(n: number) { return Array(n).fill("?").join(","); }

function mapDayColumn(day: DayKey): keyof Pick<DiaRow, "monday" | "tuesday" | "wednesday" | "thursday" | "friday"> {
    switch (day) {
        case "l": return "monday";
        case "m": return "tuesday";
        case "x": return "wednesday";
        case "j": return "thursday";
        case "v": return "friday";
    }
}

export async function fetchGlobalSemConfig(institutionId: number): Promise<GlobalSemConfig> {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings WHERE institution_id = ?",
        [institutionId]
    );
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
        s1Start: m["s1_start"] ?? "",
        s1End: m["s1_end"] ?? "",
        s2Start: m["s2_start"] ?? "",
        s2End: m["s2_end"] ?? "",
    };
}

export async function saveGlobalSemConfig(institutionId: number, cfg: GlobalSemConfig): Promise<void> {
    const db = await getDb();
    const pairs: [string, string][] = [
        ["s1_start", cfg.s1Start],
        ["s1_end", cfg.s1End],
        ["s2_start", cfg.s2Start],
        ["s2_end", cfg.s2End],
    ];
    for (const [key, value] of pairs) {
        await db.execute(
            "INSERT OR REPLACE INTO settings (institution_id, key, value) VALUES (?,?,?)",
            [institutionId, key, value ?? ""]
        );
    }
}

export async function fetchAsistenciaAll(asignaturaId: string): Promise<{
    semanas: AsistenciaSemana[];
    dias: AsistenciaDia[];
    students: AsistStudent[];
}> {
    const db = await getDb();

    const students = await db.select<EstRow[]>(`
        SELECT s.id, s.full_name
        FROM students s
        JOIN student_subject_enrollments e ON e.student_id = s.id
        WHERE e.subject_id = ?
        ORDER BY s.full_name
    `, [asignaturaId]);

    const semanaRows = await db.select<SemanaRow[]>(
        "SELECT id, subject_id, term, start_date FROM attendance_weeks WHERE subject_id = ?",
        [asignaturaId]
    );

    let diaRows: DiaRow[] = [];
    if (semanaRows.length > 0) {
        const sids = semanaRows.map(s => s.id);
        diaRows = await db.select<DiaRow[]>(
            `SELECT id, week_id, student_id, monday, tuesday, wednesday, thursday, friday FROM attendance_days WHERE week_id IN (${ph(sids.length)})`,
            sids
        );
    }

    return {
        students: students.map((student) => ({ id: student.id, nombre_completo: student.full_name })),
        semanas: semanaRows.map(s => ({
            id: s.id,
            asignaturaId: s.subject_id,
            semestre: s.term as "s1" | "s2",
            inicioDate: s.start_date,
        })),
        dias: diaRows.map(d => ({
            id: d.id,
            semanaId: d.week_id,
            estudianteId: d.student_id,
            l: d.monday as EstadoAsist | null,
            m: d.tuesday as EstadoAsist | null,
            x: d.wednesday as EstadoAsist | null,
            j: d.thursday as EstadoAsist | null,
            v: d.friday as EstadoAsist | null,
        })),
    };
}

export async function ensureSemanaForWeek(
    asignaturaId: string,
    semestre: "s1" | "s2",
    weekDate: string,
    studentIds: string[]
): Promise<{ semana: AsistenciaSemana; dias: AsistenciaDia[] }> {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>(
        "SELECT id FROM attendance_weeks WHERE subject_id=? AND term=? AND start_date=?",
        [asignaturaId, semestre, weekDate]
    );

    let semanaId: string;
    if (existing.length > 0) {
        semanaId = existing[0].id;
    } else {
        semanaId = genId();
        await db.execute(
            "INSERT INTO attendance_weeks (id, subject_id, term, start_date, sort_order) VALUES (?,?,?,?,0)",
            [semanaId, asignaturaId, semestre, weekDate]
        );
    }

    const dias: AsistenciaDia[] = [];
    for (const estId of studentIds) {
        const existingDia = await db.select<DiaRow[]>(
            "SELECT id, week_id, student_id, monday, tuesday, wednesday, thursday, friday FROM attendance_days WHERE week_id=? AND student_id=?",
            [semanaId, estId]
        );
        if (existingDia.length === 0) {
            const diaId = genId();
            await db.execute(
                "INSERT INTO attendance_days (id, week_id, student_id) VALUES (?,?,?)",
                [diaId, semanaId, estId]
            );
            dias.push({ id: diaId, semanaId, estudianteId: estId, l: null, m: null, x: null, j: null, v: null });
        } else {
            const d = existingDia[0];
            dias.push({
                id: d.id,
                semanaId,
                estudianteId: estId,
                l: d.monday as EstadoAsist | null,
                m: d.tuesday as EstadoAsist | null,
                x: d.wednesday as EstadoAsist | null,
                j: d.thursday as EstadoAsist | null,
                v: d.friday as EstadoAsist | null,
            });
        }
    }

    return { semana: { id: semanaId, asignaturaId, semestre, inicioDate: weekDate }, dias };
}

export async function updateDiaField(
    semanaId: string,
    estudianteId: string,
    day: DayKey,
    estado: EstadoAsist | null
): Promise<void> {
    const db = await getDb();
    const column = mapDayColumn(day);
    await db.execute(
        `UPDATE attendance_days SET ${column} = ? WHERE week_id = ? AND student_id = ?`,
        [estado, semanaId, estudianteId]
    );
}
