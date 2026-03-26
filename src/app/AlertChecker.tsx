import { useEffect, useRef } from "react";
import { useEvaluacionesStore } from "../features/evaluaciones/store";
import { useAsignaturasStore } from "../features/asignaturas/store";
import { useAsistenciaStore } from "../features/asistencia/store";
import { useConfiguracionStore, DEFAULT_NIVEL_CONFIG } from "../features/configuracion/store";
import { useNotificationsStore } from "../features/notifications/store";
import type { EvalEntry, StudentEval, NivelConfig } from "../features/evaluaciones/types";
import type { Umbral } from "../features/configuracion/store";
import type { DayKey } from "../features/asistencia/types";

const ASIST_DAYS: DayKey[] = ['l', 'm', 'x', 'j', 'v'];
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Pure scoring helpers ─────────────────────────────────────────────────────
function entryEarned(entry: EvalEntry): number {
    if (entry.items.length === 0) return entry.pct;
    return Math.min(entry.items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0), entry.pct);
}
function catPct(entries: EvalEntry[]): number {
    if (entries.length === 0) return 100;
    const maxPts = entries.reduce((s, e) => s + e.pct, 0);
    if (maxPts <= 0) return 100;
    return Math.round((entries.reduce((s, e) => s + entryEarned(e), 0) / maxPts) * 100);
}
function evalAsistPct(asistencia: StudentEval["asistencia"]): number {
    const allW = [...asistencia.s1, ...asistencia.s2];
    const td = allW.reduce((a, w) => a + w.dias.length, 0);
    const pr = allW.reduce((a, w) => a + w.dias.filter(Boolean).length, 0);
    return td > 0 ? Math.round((pr / td) * 100) : 100;
}
function calcScore(record: StudentEval, cfg: NivelConfig, umbralAusencias: Umbral[]): number {
    let total = 0;
    for (const cat of (["cotidiano", "tareas", "prueba", "proyecto"] as const)) {
        const w = cat === "proyecto" && cfg.numProyectos === 0 ? 0 : cfg[cat];
        total += (catPct(record[cat]) / 100) * w;
    }
    const ap = evalAsistPct(record.asistencia);
    total += (ap / 100) * cfg.asistencia;
    const absencePct = 100 - ap;
    const penalty = umbralAusencias.filter(u =>
        u.dir === ">" ? absencePct > u.valor : absencePct < u.valor
    ).length;
    return Math.min(100, Math.max(0, Math.round(total - penalty)));
}

// ─── Alert level helpers ──────────────────────────────────────────────────────
function promedioLevel(score: number, umbrales: Umbral[]): number {
    return [...umbrales].sort((a, b) => a.valor - b.valor).filter(u => score < u.valor).length;
}
function asistLevel(ap: number, umbrales: Umbral[]): number {
    return umbrales.filter(u => ap < u.valor).length;
}
function levelPriority(level: number, max: number) {
    if (level >= max) return "alta" as const;
    if (level >= Math.ceil(max / 2)) return "media" as const;
    return "baja" as const;
}
function fmtTime() {
    return new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AlertChecker() {
    const records         = useEvaluacionesStore(s => s.records);
    const asignaturas     = useAsignaturasStore(s => s.asignaturas);
    const umbralPromedio  = useConfiguracionStore(s => s.umbralPromedio);
    const umbralAusencias = useConfiguracionStore(s => s.umbralAusencias);
    const nivelConfigs    = useConfiguracionStore(s => s.nivelConfigs);
    const { sentAlerts, setSentAlert } = useNotificationsStore();

    // asistencia store (single asignatura, updated when teacher marks attendance)
    const asistDias      = useAsistenciaStore(s => s.dias);
    const asistSemanas   = useAsistenciaStore(s => s.semanas);
    const asistStudents  = useAsistenciaStore(s => s.students);
    const asistAsigId    = useAsistenciaStore(s => s.asignaturaId);

    // pending debounce timers: key → timeoutId
    const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Schedule a debounced alert. After DEBOUNCE_MS, re-validates via getState()
    // before firing to avoid stale notifications.
    function scheduleAlert(
        key: string,
        expectedLevel: number,
        maxLevel: number,
        revalidate: () => { level: number; text: string } | null,
    ) {
        // Cancel any existing timer for this key
        const existing = pendingTimers.current.get(key);
        if (existing !== undefined) clearTimeout(existing);

        const id = setTimeout(() => {
            pendingTimers.current.delete(key);

            const result = revalidate();
            if (!result) return;

            const { level, text } = result;
            // Only fire if still in alert territory and level didn't improve
            if (level < expectedLevel) return;

            const { sentAlerts: current, setSentAlert: set, add: notify } = useNotificationsStore.getState();
            const last = current[key] ?? 0;
            if (level > last) {
                notify({ text, time: fmtTime(), priority: levelPriority(level, maxLevel) });
            }
            if (level !== last) set(key, level);
        }, DEBOUNCE_MS);

        pendingTimers.current.set(key, id);
    }

    // Clear all timers on unmount
    useEffect(() => {
        const timers = pendingTimers.current;
        return () => { timers.forEach(id => clearTimeout(id)); timers.clear(); };
    }, []);

    // ── Evaluaciones + asistencia watcher ────────────────────────────────────
    useEffect(() => {
        if (!records.length || !umbralPromedio.length) return;

        for (const record of records) {
            if (!record.estudianteId) continue;

            const asig   = asignaturas.find(a => a.id === record.asignaturaId);
            const cfgKey = asig ? `${asig.año}-${asig.grupo}` : "";
            const cfg    = nivelConfigs[cfgKey] ?? DEFAULT_NIVEL_CONFIG;
            const score  = calcScore(record, cfg, umbralAusencias);
            const ap     = evalAsistPct(record.asistencia);

            // ── Promedio alert ──
            const pKey   = `p-${record.estudianteId}-${record.asignaturaId}`;
            const pLevel = promedioLevel(score, umbralPromedio);
            const pLast  = sentAlerts[pKey] ?? 0;

            if (pLevel > pLast) {
                const capturedId = record.estudianteId;
                const capturedAsigId = record.asignaturaId;
                scheduleAlert(pKey, pLevel, umbralPromedio.length, () => {
                    const { records: r } = useEvaluacionesStore.getState();
                    const { umbralPromedio: up, umbralAusencias: ua, nivelConfigs: nc } = useConfiguracionStore.getState();
                    const { asignaturas: asigs } = useAsignaturasStore.getState();
                    const rec = r.find(x => x.estudianteId === capturedId && x.asignaturaId === capturedAsigId);
                    if (!rec) return null;
                    const a = asigs.find(x => x.id === capturedAsigId);
                    const ck = a ? `${a.año}-${a.grupo}` : "";
                    const c = nc[ck] ?? DEFAULT_NIVEL_CONFIG;
                    const s = calcScore(rec, c, ua);
                    const lv = promedioLevel(s, up);
                    if (lv === 0) return null;
                    const limite = [...up].sort((x, y) => y.valor - x.valor).find(u => s < u.valor);
                    const af = a ? `${a.nombre} ${a.grupo}-${a.seccion} (${a.año})` : "asignatura";
                    return { level: lv, text: `${rec.nombre} – ${af}: ${s}% de promedio (mín. ${limite?.valor ?? ""}%)` };
                });
            }
            if (pLevel !== pLast) setSentAlert(pKey, pLevel);

            // ── Asistencia alert ──
            if (!umbralAusencias.length) continue;
            const aKey   = `a-${record.estudianteId}-${record.asignaturaId}`;
            const aLevel = asistLevel(ap, umbralAusencias);
            const aLast  = sentAlerts[aKey] ?? 0;

            if (aLevel > aLast) {
                const capturedId = record.estudianteId;
                const capturedAsigId = record.asignaturaId;
                scheduleAlert(aKey, aLevel, umbralAusencias.length, () => {
                    const { records: r } = useEvaluacionesStore.getState();
                    const { umbralAusencias: ua } = useConfiguracionStore.getState();
                    const { asignaturas: asigs } = useAsignaturasStore.getState();
                    const rec = r.find(x => x.estudianteId === capturedId && x.asignaturaId === capturedAsigId);
                    if (!rec) return null;
                    const currentAp = evalAsistPct(rec.asistencia);
                    const lv = asistLevel(currentAp, ua);
                    if (lv === 0) return null;
                    const limite = [...ua].sort((x, y) => y.valor - x.valor).find(u => currentAp < u.valor);
                    const a = asigs.find(x => x.id === capturedAsigId);
                    const af = a ? `${a.nombre} ${a.grupo}-${a.seccion} (${a.año})` : "asignatura";
                    return { level: lv, text: `${rec.nombre} – ${af}: ${currentAp}% de asistencia (mín. ${limite?.valor ?? ""}%)` };
                });
            }
            if (aLevel !== aLast) setSentAlert(aKey, aLevel);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [records, umbralPromedio, umbralAusencias]);

    // ── Asistencia store watcher (fires when teacher marks attendance) ──────────
    useEffect(() => {
        if (!umbralAusencias.length || !asistAsigId || !asistStudents.length) return;

        // Build diaMap: semanaId → estudianteId → dia
        const diaMap = new Map<string, Map<string, typeof asistDias[0]>>();
        asistDias.forEach(d => {
            if (!diaMap.has(d.semanaId)) diaMap.set(d.semanaId, new Map());
            diaMap.get(d.semanaId)!.set(d.estudianteId, d);
        });

        for (const student of asistStudents) {
            let present = 0, total = 0;
            asistSemanas.forEach(sem => {
                const dia = diaMap.get(sem.id)?.get(student.id);
                if (!dia) return;
                ASIST_DAYS.forEach(k => {
                    const e = dia[k];
                    if (e) { total++; if (e === 'P' || e === 'T') present++; }
                });
            });
            if (total === 0) continue;

            const ap     = Math.round((present / total) * 100);
            const aKey   = `a-${student.id}-${asistAsigId}`;
            const aLevel = asistLevel(ap, umbralAusencias);
            const aLast  = sentAlerts[aKey] ?? 0;

            if (aLevel > aLast) {
                const capturedStudentId = student.id;
                const capturedAsigId    = asistAsigId;
                scheduleAlert(aKey, aLevel, umbralAusencias.length, () => {
                    const { umbralAusencias: ua } = useConfiguracionStore.getState();
                    const { asignaturas: asigs } = useAsignaturasStore.getState();
                    const { dias, semanas, students } = useAsistenciaStore.getState();
                    const st = students.find(x => x.id === capturedStudentId);
                    if (!st) return null;

                    const dm = new Map<string, Map<string, typeof dias[0]>>();
                    dias.forEach(d => {
                        if (!dm.has(d.semanaId)) dm.set(d.semanaId, new Map());
                        dm.get(d.semanaId)!.set(d.estudianteId, d);
                    });
                    let p = 0, t = 0;
                    semanas.forEach(sem => {
                        const d = dm.get(sem.id)?.get(capturedStudentId);
                        if (!d) return;
                        ASIST_DAYS.forEach(k => {
                            const e = d[k];
                            if (e) { t++; if (e === 'P' || e === 'T') p++; }
                        });
                    });
                    if (t === 0) return null;
                    const currentAp = Math.round((p / t) * 100);
                    const lv = asistLevel(currentAp, ua);
                    if (lv === 0) return null;
                    const limite = [...ua].sort((x, y) => y.valor - x.valor).find(u => currentAp < u.valor);
                    const a = asigs.find(x => x.id === capturedAsigId);
                    const af = a ? `${a.nombre} ${a.grupo}-${a.seccion} (${a.año})` : "asignatura";
                    return { level: lv, text: `${st.nombre_completo} – ${af}: ${currentAp}% de asistencia (mín. ${limite?.valor ?? ""}%)` };
                });
            }
            if (aLevel !== aLast) setSentAlert(aKey, aLevel);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [asistDias, umbralAusencias]);

    return null;
}
