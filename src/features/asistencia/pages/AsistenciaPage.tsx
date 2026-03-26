import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAsistenciaStore } from "../store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import { useAuthStore } from "../../auth/store";
import type { DayKey, EstadoAsist } from "../types";
import styles from "../AsistenciaPage.module.css";

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronRightIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"/>
    </svg>
);
const ChevronLeftIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"/>
    </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS: { key: DayKey; label: string; offset: number }[] = [
    { key: 'l', label: 'L', offset: 0 },
    { key: 'm', label: 'K', offset: 1 },
    { key: 'x', label: 'M', offset: 2 },
    { key: 'j', label: 'J', offset: 3 },
    { key: 'v', label: 'V', offset: 4 },
];
const CYCLE: (EstadoAsist | null)[] = [null, 'P', 'I', 'T', 'J'];
const MONTH_NAMES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
function fmtDay(dateStr: string): string {
    return String(new Date(dateStr + 'T12:00:00').getDate()).padStart(2, '0');
}
function cycleEstado(curr: EstadoAsist | null): EstadoAsist | null {
    return CYCLE[(CYCLE.indexOf(curr) + 1) % CYCLE.length];
}
function getCellMod(estado: EstadoAsist | null): string {
    if (estado === 'P') return styles.cellP;
    if (estado === 'I') return styles.cellI;
    if (estado === 'T') return styles.cellT;
    if (estado === 'J') return styles.cellJ;
    return '';
}


/** Group consecutive items by computed key */
function groupConsec<T>(arr: T[], key: (t: T) => string): { k: string; count: number; first: T }[] {
    const out: { k: string; count: number; first: T }[] = [];
    for (const t of arr) {
        const k = key(t);
        if (!out.length || out[out.length - 1].k !== k) out.push({ k, count: 1, first: t });
        else out[out.length - 1].count++;
    }
    return out;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MonthGroup = { key: string; month: number; label: string; weeks: string[] };
type SemGroup   = { semId: 's1' | 's2'; label: string; startDate: string; endDate: string; months: MonthGroup[] };
type DisplayCol =
    | { type: 'month-c'; semId: string; monthKey: string }
    | { type: 'day';     semId: string; semestre: 's1' | 's2'; monthKey: string;
        weekDate: string; weekIdx: number; dayKey: DayKey; date: string; dayLabel: string };

// ─── Page ─────────────────────────────────────────────────────────────────────
export function AsistenciaPage() {
    const asignaturas = useAsignaturasStore(s => s.asignaturas);
    const { semConfig, semanas, dias, students, loadAll, updateDia } = useAsistenciaStore();
    const institution = useInstitutionStore(selectCurrentInstitution);
    const user        = useAuthStore(s => s.user);

    const [searchParams] = useSearchParams();
    const [selectedAsigId, setSelectedAsigId]   = useState(searchParams.get("asig") ?? "");
    const [collapsedMonths, setCollapsedMonths]  = useState<Set<string>>(new Set());

    const asigId = selectedAsigId || asignaturas[0]?.id || "";
    const asig   = asignaturas.find(a => a.id === asigId);

    useEffect(() => {
        if (asigId) loadAll(asigId, institution.id);
    }, [asigId, institution.id, loadAll]);

    // Reload global config when institution changes
    useEffect(() => {
        if (institution.id) loadAll(asigId || "", institution.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [institution.id]);

    // ── Semester groups ───────────────────────────────────────────────────────
    const semGroups = useMemo<SemGroup[]>(() => {
        const { s1Start, s1End, s2Start, s2End } = semConfig;
        const parseRange = (s: string, e: string) =>
            s && e ? { start: new Date(s + 'T12:00:00'), end: new Date(e + 'T12:00:00') } : null;
        const r1 = parseRange(s1Start, s1End);
        const r2 = parseRange(s2Start, s2End);
        if (!r1 && !r2) return [];

        const allMs = [r1?.start, r1?.end, r2?.start, r2?.end].filter(Boolean) as Date[];
        const minYear = Math.min(...allMs.map(d => d.getFullYear()));
        const maxYear = Math.max(...allMs.map(d => d.getFullYear()));

        const s1Months: MonthGroup[] = [];
        const s2Months: MonthGroup[] = [];

        for (let year = minYear; year <= maxYear; year++) {
            for (let mo = 0; mo < 12; mo++) {
                const mFirst = new Date(year, mo, 1);
                const mLast  = new Date(year, mo + 1, 0);

                // Assign month to exactly one semester (S1 takes priority)
                let sem: 's1' | 's2' | null = null;
                let rng: { start: Date; end: Date } | null = null;
                if (r1 && mFirst <= r1.end && mLast >= r1.start) { sem = 's1'; rng = r1; }
                else if (r2 && mFirst <= r2.end && mLast >= r2.start) { sem = 's2'; rng = r2; }
                if (!sem || !rng) continue;

                // Find first Monday IN this month
                const weeks: string[] = [];
                const mon = new Date(mFirst);
                const dow = mon.getDay();
                if (dow !== 1) mon.setDate(mon.getDate() + (dow === 0 ? 1 : 8 - dow));

                while (mon <= mLast) {
                    const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
                    // Include week only if it overlaps the semester range
                    if (mon <= rng.end && fri >= rng.start) {
                        weeks.push(mon.toISOString().slice(0, 10));
                    }
                    mon.setDate(mon.getDate() + 7);
                }

                if (weeks.length) {
                    const g: MonthGroup = { key: `${year}-${mo}`, month: mo, label: MONTH_NAMES[mo], weeks };
                    (sem === 's1' ? s1Months : s2Months).push(g);
                }
            }
        }

        const result: SemGroup[] = [];
        if (r1 && s1Months.length) result.push({ semId: 's1', label: 'Semestre I',  startDate: s1Start, endDate: s1End,  months: s1Months });
        if (r2 && s2Months.length) result.push({ semId: 's2', label: 'Semestre II', startDate: s2Start, endDate: s2End, months: s2Months });
        return result;
    }, [semConfig]);

    // ── Flat display columns ──────────────────────────────────────────────────
    const displayCols = useMemo<DisplayCol[]>(() => {
        const cols: DisplayCol[] = [];
        for (const sg of semGroups) {
            for (const m of sg.months) {
                const mKey = `${sg.semId}-${m.key}`;
                if (collapsedMonths.has(mKey)) {
                    cols.push({ type: 'month-c', semId: sg.semId, monthKey: m.key });
                    continue;
                }
                m.weeks.forEach((wd, wi) => {
                    DAYS.forEach(d => {
                        cols.push({
                            type: 'day', semId: sg.semId, semestre: sg.semId,
                            monthKey: m.key, weekDate: wd, weekIdx: wi + 1,
                            dayKey: d.key, date: addDays(wd, d.offset), dayLabel: d.label,
                        });
                    });
                });
            }
        }
        return cols;
    }, [semGroups, collapsedMonths]);

    // ── Lookup maps ───────────────────────────────────────────────────────────
    const semanaByKey = useMemo(() => {
        const m = new Map<string, string>();
        semanas.forEach(s => m.set(`${s.semestre}-${s.inicioDate}`, s.id));
        return m;
    }, [semanas]);

    const diaMap = useMemo(() => {
        const m = new Map<string, Map<string, typeof dias[0]>>();
        dias.forEach(d => {
            if (!m.has(d.semanaId)) m.set(d.semanaId, new Map());
            m.get(d.semanaId)!.set(d.estudianteId, d);
        });
        return m;
    }, [dias]);

    // ── Toggle collapse ───────────────────────────────────────────────────────
    function toggleMonth(key: string) {
        setCollapsedMonths(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    }

    // ── Header groupings ──────────────────────────────────────────────────────
    const row1 = groupConsec(displayCols, c => c.semId);
    const row2 = groupConsec(displayCols, c => `${c.semId}-${c.monthKey}`);
    const row3 = groupConsec(displayCols, c =>
        c.type === 'day' ? `${c.semId}-${c.monthKey}-${c.weekDate}` : `sp-${c.semId}-${c.monthKey}`
    );

    // Index of the first S2 column in the flat displayCols array (for the divider line)
    const firstS2ColIdx = displayCols.findIndex(c => c.semId === 's2');
    const firstS2Row2   = row2.findIndex(g => g.first.semId === 's2');
    const firstS2Row3   = row3.findIndex(g => g.first.semId === 's2');

    // ── Totals (all recorded weeks, ignoring collapse state) ─────────────────
    function totals(estId: string) {
        let P = 0, I = 0, T = 0, J = 0, tot = 0;
        semanas.forEach(s => {
            const dia = diaMap.get(s.id)?.get(estId);
            if (!dia) return;
            DAYS.forEach(d => {
                const e = dia[d.key];
                if (e) { tot++; if (e==='P') P++; else if (e==='I') I++; else if (e==='T') T++; else if (e==='J') J++; }
            });
        });
        return { P, I, T, J, pct: tot > 0 ? Math.round((P + T) / tot * 100) : null };
    }

    const hasCfg = (semConfig.s1Start && semConfig.s1End) || (semConfig.s2Start && semConfig.s2End);

    if (!asigId) return (
        <div className={styles.noAsig}>No hay asignaturas disponibles.</div>
    );

    return (
        <div className={styles.page}>
            {/* ── Info header ─────────────────────────────────────────────── */}
            <div className={styles.infoHeader}>
                <div className={styles.infoRow}>
                    <div className={styles.infoField}>
                        <span className={styles.infoLabel}>Institución educativa</span>
                        <span className={styles.infoValue}>{institution.name || '—'}</span>
                    </div>
                    <div className={styles.infoField}>
                        <span className={styles.infoLabel}>Docente</span>
                        <span className={styles.infoValue}>{user?.name || '—'}</span>
                    </div>
                    <div className={styles.infoFieldWide}>
                        <span className={styles.infoLabel}>Curso</span>
                        <div className={styles.asigSelectWrap}>
                            <span className={styles.asigSelectDisplay}>{asig?.nombre ?? ''}</span>
                            <select className={styles.asigSelectNative} value={asigId}
                                onChange={e => setSelectedAsigId(e.target.value)}>
                                {asignaturas.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.nombre} · Grupo {a.grupo} · Sección {a.seccion}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={styles.infoFieldSm}>
                        <span className={styles.infoLabel}>Grupo</span>
                        <span className={styles.infoValue}>{asig?.grupo ?? '—'}</span>
                    </div>
                    <div className={styles.infoFieldSm}>
                        <span className={styles.infoLabel}>Sección</span>
                        <span className={styles.infoValue}>{asig?.seccion || '—'}</span>
                    </div>
                    <div className={styles.infoActions}>
                        <Link to="/app/configuracion" className={styles.configBtn}>
                            ⚙ Configuración
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── No-config notice ─────────────────────────────────────────── */}
            {!hasCfg && (
                <div className={styles.notice}>
                    <span>Configure las fechas de inicio y fin de cada semestre para generar las semanas automáticamente.</span>
                    <Link to="/app/configuracion" className={styles.configBtn}>
                        ⚙ Configurar ahora
                    </Link>
                </div>
            )}

            {/* ── Table ────────────────────────────────────────────────────── */}
            {hasCfg && (
                <div className={styles.tableWrap}>
                    {students.length === 0 ? (
                        <div className={styles.empty}>
                            <p>Sin estudiantes matriculados</p>
                            <span>Matricula estudiantes en esta asignatura para registrar asistencia.</span>
                        </div>
                    ) : (
                    <table className={styles.table}>
                        <thead>
                            {/* Row 1 — Semester banners */}
                            <tr>
                                <th className={`${styles.th} ${styles.thNum}`}  rowSpan={4}>#</th>
                                <th className={`${styles.th} ${styles.thName}`} rowSpan={4}>Apellidos y Nombres</th>
                                {row1.map(g => {
                                    const sg = semGroups.find(s => s.semId === g.k);
                                    return (
                                        <th key={g.k} colSpan={g.count}
                                            className={`${styles.th} ${styles.thSem} ${g.k === 's2' && firstS2ColIdx >= 0 ? styles.semSplit : ''}`}>
                                            {sg?.label ?? g.k}
                                            {sg?.startDate && (
                                                <span className={styles.semDates}>
                                                    {sg.startDate} — {sg.endDate}
                                                </span>
                                            )}
                                        </th>
                                    );
                                })}
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumP}`}   rowSpan={4}>Presentes</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumPct}`} rowSpan={4}>% Asist.</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumI}`}   rowSpan={4}>Ausencias</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumT}`}   rowSpan={4}>Tardías</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumJ}`}   rowSpan={4}>Justificadas</th>
                            </tr>

                            {/* Row 2 — Month headers */}
                            <tr>
                                {row2.map((g, gi) => {
                                    const col = g.first;
                                    const isSplit = firstS2ColIdx >= 0 && gi === firstS2Row2;
                                    const splitCls = isSplit ? styles.semSplit : '';
                                    const semId = col.semId;
                                    if (col.type === 'month-c') {
                                        const mKey = `${semId}-${col.monthKey}`;
                                        const mLabel = semGroups.find(s => s.semId === semId)?.months.find(m => m.key === col.monthKey)?.label ?? '';
                                        return (
                                            <th key={gi} colSpan={g.count}
                                                className={`${styles.th} ${styles.thMonth} ${styles.thMonthColl} ${splitCls}`}>
                                                {mLabel}
                                                <button className={styles.monthCollapseBtn} onClick={() => toggleMonth(mKey)} title="Expandir mes"><ChevronRightIcon /></button>
                                            </th>
                                        );
                                    }
                                    if (col.type === 'day') {
                                        const mKey = `${semId}-${col.monthKey}`;
                                        const mLabel = semGroups.find(s => s.semId === semId)?.months.find(m => m.key === col.monthKey)?.label ?? '';
                                        return (
                                            <th key={gi} colSpan={g.count}
                                                className={`${styles.th} ${styles.thMonth} ${splitCls}`}>
                                                {mLabel}
                                                <button className={styles.monthCollapseBtn} onClick={() => toggleMonth(mKey)} title="Colapsar mes"><ChevronLeftIcon /></button>
                                            </th>
                                        );
                                    }
                                    return <th key={gi} className={`${styles.th} ${splitCls}`} />;
                                })}
                            </tr>

                            {/* Row 3 — Week labels */}
                            <tr>
                                {row3.map((g, gi) => {
                                    const col = g.first;
                                    const isSplit = firstS2ColIdx >= 0 && gi === firstS2Row3;
                                    const splitCls = isSplit ? styles.semSplit : '';
                                    if (col.type !== 'day') return (
                                        <th key={gi} colSpan={g.count} className={`${styles.th} ${styles.thWeek} ${styles.thCollSpacer} ${splitCls}`} />
                                    );
                                    return (
                                        <th key={gi} colSpan={5} className={`${styles.th} ${styles.thWeek} ${splitCls}`}>
                                            Semana {col.weekIdx}
                                        </th>
                                    );
                                })}
                            </tr>

                            {/* Row 4 — Day labels + dates */}
                            <tr>
                                {displayCols.map((col, ci) => {
                                    const splitCls = firstS2ColIdx >= 0 && ci === firstS2ColIdx ? styles.semSplit : '';
                                    if (col.type !== 'day') return <th key={ci} className={`${styles.th} ${styles.thCollSpacer} ${splitCls}`} />;
                                    return (
                                        <th key={ci} className={`${styles.thDay} ${splitCls}`}>
                                            <div className={styles.dayLabel}>{col.dayLabel}</div>
                                            <div className={styles.dayDate}>{fmtDay(col.date)}</div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {students.map((est, idx) => {
                                const t = totals(est.id);
                                return (
                                    <tr key={est.id} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                                        <td className={`${styles.td} ${styles.tdNum}`}>{idx + 1}</td>
                                        <td className={`${styles.td} ${styles.tdName}`}>{est.nombre_completo}</td>
                                        {displayCols.map((col, ci) => {
                                            const splitCls = firstS2ColIdx >= 0 && ci === firstS2ColIdx ? styles.semSplit : '';
                                            if (col.type !== 'day') return <td key={ci} className={`${styles.tdSpacer} ${styles.tdCollSpacer} ${splitCls}`} />;
                                            const semanaId = semanaByKey.get(`${col.semestre}-${col.weekDate}`);
                                            const dia      = semanaId ? diaMap.get(semanaId)?.get(est.id) : null;
                                            const estado   = dia?.[col.dayKey] ?? null;
                                            return (
                                                <td key={ci}
                                                    className={`${styles.cell} ${getCellMod(estado)} ${splitCls}`}
                                                    onClick={() => updateDia(col.weekDate, est.id, col.dayKey, cycleEstado(estado))}>
                                                </td>
                                            );
                                        })}
                                        <td className={`${styles.sumTd} ${styles.sumTdP}`}   title={est.nombre_completo}>{t.P || ''}</td>
                                        <td className={`${styles.sumTd} ${styles.sumTdPct}`} title={est.nombre_completo}>{t.pct !== null ? `${t.pct}%` : '—'}</td>
                                        <td className={`${styles.sumTd} ${styles.sumTdI}`}   title={est.nombre_completo}>{t.I || ''}</td>
                                        <td className={`${styles.sumTd} ${styles.sumTdT}`}   title={est.nombre_completo}>{t.T || ''}</td>
                                        <td className={`${styles.sumTd} ${styles.sumTdJ}`}   title={est.nombre_completo}>{t.J || ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    )}
                </div>
            )}

        </div>
    );
}
