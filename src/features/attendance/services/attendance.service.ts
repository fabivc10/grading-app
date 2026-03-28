import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { AsistenciaSemana, AsistenciaDia, AsistStudent, DayKey, EstadoAsist, GlobalSemConfig } from "../types";

type SemanaRow = { id: string; asignatura_id: string; semestre: string; inicio_date: string };
type DiaRow    = { id: string; semana_id: string; estudiante_id: string; l: string|null; m: string|null; x: string|null; j: string|null; v: string|null };
type EstRow    = { id: string; nombre_completo: string };

function ph(n: number) { return Array(n).fill("?").join(","); }

// ─── Global semester config ───────────────────────────────────────────────────
export async function fetchGlobalSemConfig(institutionId: number): Promise<GlobalSemConfig> {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings WHERE institution_id = ?",
        [institutionId]
    );
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
        s1Start: m['s1_start'] ?? '',
        s1End:   m['s1_end']   ?? '',
        s2Start: m['s2_start'] ?? '',
        s2End:   m['s2_end']   ?? '',
    };
}

export async function saveGlobalSemConfig(institutionId: number, cfg: GlobalSemConfig): Promise<void> {
    const db = await getDb();
    const pairs: [string, string][] = [
        ['s1_start', cfg.s1Start],
        ['s1_end',   cfg.s1End],
        ['s2_start', cfg.s2Start],
        ['s2_end',   cfg.s2End],
    ];
    for (const [key, value] of pairs) {
        await db.execute(
            "INSERT OR REPLACE INTO settings (institution_id, key, value) VALUES (?,?,?)",
            [institutionId, key, value ?? '']
        );
    }
}

// ─── Fetch all attendance data for an asignatura ──────────────────────────────
export async function fetchAsistenciaAll(asignaturaId: string): Promise<{
    semanas: AsistenciaSemana[];
    dias:    AsistenciaDia[];
    students: AsistStudent[];
}> {
    const db = await getDb();

    const students = await db.select<EstRow[]>(`
        SELECT e.id, e.nombre_completo
        FROM estudiantes e
        JOIN estudiante_asignaturas ea ON ea.estudiante_id = e.id
        WHERE ea.asignatura_id = ?
        ORDER BY e.nombre_completo
    `, [asignaturaId]);

    const semanaRows = await db.select<SemanaRow[]>(
        "SELECT * FROM asistencia_semanas WHERE asignatura_id = ?",
        [asignaturaId]
    );

    let diaRows: DiaRow[] = [];
    if (semanaRows.length > 0) {
        const sids = semanaRows.map(s => s.id);
        diaRows = await db.select<DiaRow[]>(
            `SELECT * FROM asistencia_dias WHERE semana_id IN (${ph(sids.length)})`,
            sids
        );
    }

    return {
        students,
        semanas: semanaRows.map(s => ({
            id: s.id,
            asignaturaId: s.asignatura_id,
            semestre: s.semestre as 's1' | 's2',
            inicioDate: s.inicio_date,
        })),
        dias: diaRows.map(d => ({
            id: d.id, semanaId: d.semana_id, estudianteId: d.estudiante_id,
            l: d.l as EstadoAsist | null, m: d.m as EstadoAsist | null,
            x: d.x as EstadoAsist | null, j: d.j as EstadoAsist | null,
            v: d.v as EstadoAsist | null,
        })),
    };
}

// ─── Ensure semana + dia rows exist; create if missing ───────────────────────
export async function ensureSemanaForWeek(
    asignaturaId: string,
    semestre: 's1' | 's2',
    weekDate: string,
    studentIds: string[]
): Promise<{ semana: AsistenciaSemana; dias: AsistenciaDia[] }> {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>(
        "SELECT id FROM asistencia_semanas WHERE asignatura_id=? AND semestre=? AND inicio_date=?",
        [asignaturaId, semestre, weekDate]
    );

    let semanaId: string;
    if (existing.length > 0) {
        semanaId = existing[0].id;
    } else {
        semanaId = genId();
        await db.execute(
            "INSERT INTO asistencia_semanas (id, asignatura_id, semestre, inicio_date, orden) VALUES (?,?,?,?,0)",
            [semanaId, asignaturaId, semestre, weekDate]
        );
    }

    const dias: AsistenciaDia[] = [];
    for (const estId of studentIds) {
        const existingDia = await db.select<{ id: string; l: string|null; m: string|null; x: string|null; j: string|null; v: string|null }[]>(
            "SELECT id, l, m, x, j, v FROM asistencia_dias WHERE semana_id=? AND estudiante_id=?",
            [semanaId, estId]
        );
        if (existingDia.length === 0) {
            const diaId = genId();
            await db.execute(
                "INSERT INTO asistencia_dias (id, semana_id, estudiante_id) VALUES (?,?,?)",
                [diaId, semanaId, estId]
            );
            dias.push({ id: diaId, semanaId, estudianteId: estId, l: null, m: null, x: null, j: null, v: null });
        } else {
            const d = existingDia[0];
            dias.push({ id: d.id, semanaId, estudianteId: estId,
                l: d.l as EstadoAsist|null, m: d.m as EstadoAsist|null,
                x: d.x as EstadoAsist|null, j: d.j as EstadoAsist|null,
                v: d.v as EstadoAsist|null });
        }
    }

    return { semana: { id: semanaId, asignaturaId, semestre, inicioDate: weekDate }, dias };
}

// ─── Update a single attendance field ────────────────────────────────────────
export async function updateDiaField(
    semanaId: string,
    estudianteId: string,
    day: DayKey,
    estado: EstadoAsist | null
): Promise<void> {
    const db = await getDb();
    await db.execute(
        `UPDATE asistencia_dias SET ${day} = ? WHERE semana_id = ? AND estudiante_id = ?`,
        [estado, semanaId, estudianteId]
    );
}
