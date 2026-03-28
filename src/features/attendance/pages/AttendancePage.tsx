import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAsistenciaStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import { useAuthStore } from "../../auth/store";
import { useConfiguracionStore } from "../../settings/store";
import { getAttendanceStats } from "../utils/attendance.utils";
import type { DayKey, EstadoAsist, GlobalSemConfig } from "../types";
import styles from "./AttendancePage.module.css";

//  Icons 
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

//  Constants 
const DAYS: { key: DayKey; label: string; offset: number }[] = [
    { key: 'l', label: 'L', offset: 0 },
    { key: 'm', label: 'K', offset: 1 },
    { key: 'x', label: 'M', offset: 2 },
    { key: 'j', label: 'J', offset: 3 },
    { key: 'v', label: 'V', offset: 4 },
];
const CYCLE: (EstadoAsist | null)[] = [null, 'P', 'T', 'J', 'I'];
const MONTH_NAMES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

//  Date helpers 
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

//  Types 
type DisplayCol =
    | { type: 'month-c'; segment: 's1' | 's2' | 'outside'; monthKey: string }
    | { type: 'day';     segment: 's1' | 's2' | 'outside'; semestre: 's1' | 's2' | null; monthKey: string;
        weekDate: string; weekIdx: number; dayKey: DayKey; date: string; dayLabel: string; blocked: boolean };

function isDateWithinSemester(date: string, semId: 's1' | 's2', cfg: GlobalSemConfig) {
    const current = new Date(date + 'T12:00:00');
    const start = semId === 's1' ? cfg.s1Start : cfg.s2Start;
    const end = semId === 's1' ? cfg.s1End : cfg.s2End;
    if (!start || !end) return false;
    return current >= new Date(start + 'T12:00:00') && current <= new Date(end + 'T12:00:00');
}

function getSemesterForDate(date: string, cfg: GlobalSemConfig): 's1' | 's2' | null {
    if (isDateWithinSemester(date, 's1', cfg)) return 's1';
    if (isDateWithinSemester(date, 's2', cfg)) return 's2';
    return null;
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
}

function endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0);
}

//  Page 
export function AttendancePage() {
    const asignaturas = useAsignaturasStore(s => s.asignaturas);
    const { semConfig, semanas, dias, students, loadAll, updateDia } = useAsistenciaStore();
    const institution = useInstitutionStore(selectCurrentInstitution);
    const user        = useAuthStore(s => s.user);
    const unjustifiedAbsencesPerFault = useConfiguracionStore(s => s.unjustifiedAbsencesPerFault);
    const tardiesPerFault = useConfiguracionStore(s => s.tardiesPerFault);

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

    //  Semester groups 
    const parseRange = (s: string, e: string) =>
        s && e ? { start: new Date(s + 'T12:00:00'), end: new Date(e + 'T12:00:00') } : null;

    //  Flat display columns 
    const displayCols = useMemo<DisplayCol[]>(() => {
        const { s1Start, s1End, s2Start, s2End } = semConfig;
        const r1 = parseRange(s1Start, s1End);
        const r2 = parseRange(s2Start, s2End);
        const allRanges = [r1, r2].filter(Boolean) as { start: Date; end: Date }[];
        if (!allRanges.length) return [];

        const cols: DisplayCol[] = [];
        const visibleStart = startOfMonth(new Date(Math.min(...allRanges.map(r => r.start.getTime()))));
        const visibleEnd = endOfMonth(new Date(Math.max(...allRanges.map(r => r.end.getTime()))));
        const firstMonday = new Date(visibleStart);
        const firstDow = firstMonday.getDay();
        if (firstDow !== 1) firstMonday.setDate(firstMonday.getDate() - (firstDow === 0 ? 6 : firstDow - 1));

        const cursor = new Date(firstMonday);
        const monthWeekCounts = new Map<string, number>();

        while (cursor <= visibleEnd) {
            const weekDate = cursor.toISOString().slice(0, 10);
            const weekEntries: Extract<DisplayCol, { type: "day" }>[] = [];

            DAYS.forEach(d => {
                const date = addDays(weekDate, d.offset);
                const current = new Date(date + "T12:00:00");
                if (current < visibleStart || current > visibleEnd) return;
                const monthKey = `${current.getFullYear()}-${current.getMonth()}`;
                const semestre = getSemesterForDate(date, semConfig);
                const segment = semestre ?? "outside";
                weekEntries.push({
                    type: "day",
                    segment,
                    semestre,
                    monthKey,
                    weekDate,
                    weekIdx: 0,
                    dayKey: d.key,
                    date,
                    dayLabel: d.label,
                    blocked: semestre === null,
                });
            });

            if (weekEntries.length > 0) {
                const monthWeekIndex = new Map<string, number>();
                [...new Set(weekEntries.map((entry) => entry.monthKey))].forEach((monthKey) => {
                    const nextWeek = (monthWeekCounts.get(monthKey) ?? 0) + 1;
                    monthWeekCounts.set(monthKey, nextWeek);
                    monthWeekIndex.set(monthKey, nextWeek);
                });

                groupConsec(weekEntries, (entry) => entry.monthKey).forEach((group) => {
                    const monthKey = group.k;
                    if (collapsedMonths.has(monthKey)) {
                        cols.push({
                            type: "month-c",
                            segment: group.first.segment,
                            monthKey,
                        });
                        return;
                    }

                    weekEntries
                        .filter((entry) => entry.monthKey === monthKey)
                        .forEach((entry) => cols.push({
                            ...entry,
                            weekIdx: monthWeekIndex.get(entry.monthKey) ?? 1,
                        }));
                });
            }

            cursor.setDate(cursor.getDate() + 7);
        }

        return cols;
    }, [collapsedMonths, semConfig]);

    //  Lookup maps 
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

    //  Toggle collapse 
    function toggleMonth(key: string) {
        setCollapsedMonths(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    }

    //  Header groupings 
    const row1 = groupConsec(displayCols, c => c.segment);
    const row2 = groupConsec(displayCols, c => c.monthKey);
    const row3 = groupConsec(displayCols, c =>
        c.type === 'day' ? `${c.monthKey}-${c.weekDate}` : `sp-${c.monthKey}`
    );

    // Index of the first S2 column in the flat displayCols array (for the divider line)
    const firstS2ColIdx = displayCols.findIndex(c => c.segment === 's2');
    const firstS2Row2   = row2.findIndex(g => g.first.segment === 's2');
    const firstS2Row3   = row3.findIndex(g => g.first.segment === 's2');

    //  Totals (all recorded weeks, ignoring collapse state) 
    function totals(estId: string) {
        const marks: EstadoAsist[] = [];
        semanas.forEach(s => {
            const dia = diaMap.get(s.id)?.get(estId);
            if (!dia) return;
            DAYS.forEach(d => {
                const e = dia[d.key];
                if (e) marks.push(e);
            });
        });
        const stats = getAttendanceStats(marks, unjustifiedAbsencesPerFault, tardiesPerFault);
        return {
            P: stats.present,
            I: stats.unjustified,
            T: stats.tardy,
            J: stats.justified,
            pct: marks.length > 0 ? stats.pct : null,
        };
    }

    const hasCfg = (semConfig.s1Start && semConfig.s1End) || (semConfig.s2Start && semConfig.s2End);

    if (!asigId) return (
        <div className={styles.noAsig}>No hay asignaturas disponibles.</div>
    );

    return (
        <div className={styles.page}>
            {/*  Info header  */}
            <div className={styles.infoHeader}>
                <div className={styles.infoRow}>
                    <div className={styles.infoField}>
                        <span className={styles.infoLabel}>Institucin educativa</span>
                        <span className={styles.infoValue}>{institution.name || ''}</span>
                    </div>
                    <div className={styles.infoField}>
                        <span className={styles.infoLabel}>Docente</span>
                        <span className={styles.infoValue}>{user?.name || ''}</span>
                    </div>
                    <div className={styles.infoFieldWide}>
                        <span className={styles.infoLabel}>Curso</span>
                        <div className={styles.asigSelectWrap}>
                            <span className={styles.asigSelectDisplay}>{asig?.nombre ?? ""}</span>
                            <select className={styles.asigSelectNative} value={asigId}
                                onChange={e => setSelectedAsigId(e.target.value)}>
                                {asignaturas.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {`${a.nombre} ${a.grupo}-${a.seccion} (${a.year})`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={styles.infoFieldSm}>
                        <span className={styles.infoLabel}>Year</span>
                        <span className={styles.infoValue}>{asig?.year ?? ''}</span>
                    </div>
                    <div className={styles.infoFieldSm}>
                        <span className={styles.infoLabel}>Grupo</span>
                        <span className={styles.infoValue}>{asig?.grupo ?? ''}</span>
                    </div>
                    <div className={styles.infoFieldSm}>
                        <span className={styles.infoLabel}>Seccin</span>
                        <span className={styles.infoValue}>{asig?.seccion || ''}</span>
                    </div>
                    <div className={styles.infoActions} />
                </div>
            </div>

            {/*  No-config notice  */}
            {!hasCfg && (
                <div className={styles.notice}>
                    <span>Configure las fechas de inicio y fin de cada semestre para generar las semanas automticamente.</span>
                </div>
            )}

            {/*  Table  */}
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
                            {/* Row 1  Semester banners */}
                            <tr>
                                <th className={`${styles.th} ${styles.thNum}`}  rowSpan={4}>#</th>
                                <th className={`${styles.th} ${styles.thName}`} rowSpan={4}>Apellidos y Nombres</th>
                                {row1.map((g, gi) => {
                                    const segment = g.first.segment;
                                    const splitCls = segment === 's2' && firstS2ColIdx >= 0 ? styles.semSplit : '';
                                    const isOutside = segment === 'outside';
                                    const startDate = segment === 's1' ? semConfig.s1Start : segment === 's2' ? semConfig.s2Start : '';
                                    const endDate = segment === 's1' ? semConfig.s1End : segment === 's2' ? semConfig.s2End : '';
                                    const sg = { label: isOutside ? '' : (segment === 's1' ? 'Semestre I' : 'Semestre II'), startDate, endDate };
                                    return (
                                        <th key={`${g.k}-${gi}`} colSpan={g.count}
                                            className={`${styles.th} ${isOutside ? styles.thSemOutside : styles.thSem} ${splitCls}`}>
                                            {sg.label}
                                            {startDate && (
                                                <span className={styles.semDates}>
                                                    {sg.startDate}  {sg.endDate}
                                                </span>
                                            )}
                                        </th>
                                    );
                                })}
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumP}`}   rowSpan={4}>Presentes</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumPct}`} rowSpan={4}>% Asist.</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumI}`}   rowSpan={4}>Ausencias</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumT}`}   rowSpan={4}>Tardas</th>
                                <th className={`${styles.th} ${styles.thSum} ${styles.thSumJ}`}   rowSpan={4}>Justificadas</th>
                            </tr>

                            {/* Row 2  Month headers */}
                            <tr>
                                {row2.map((g, gi) => {
                                    const col = g.first;
                                    const isSplit = firstS2ColIdx >= 0 && gi === firstS2Row2;
                                    const splitCls = isSplit ? styles.semSplit : '';
                                    const segment = col.segment;
                                    const month = Number(col.monthKey.split('-')[1]);
                                    const mLabel = MONTH_NAMES[month] ?? '';
                                    if (col.type === 'month-c') {
                                        const mKey = col.monthKey;
                                        return (
                                            <th key={gi} colSpan={g.count}
                                                className={`${styles.th} ${styles.thMonth} ${styles.thMonthColl} ${segment === 'outside' ? styles.thMonthOutside : ''} ${splitCls}`}>
                                                {mLabel}
                                                <button className={styles.monthCollapseBtn} onClick={() => toggleMonth(mKey)} title="Expandir mes"><ChevronRightIcon /></button>
                                            </th>
                                        );
                                    }
                                    if (col.type === 'day') {
                                        const mKey = col.monthKey;
                                        return (
                                            <th key={gi} colSpan={g.count}
                                                className={`${styles.th} ${styles.thMonth} ${segment === 'outside' ? styles.thMonthOutside : ''} ${splitCls}`}>
                                                {mLabel}
                                                <button className={styles.monthCollapseBtn} onClick={() => toggleMonth(mKey)} title="Colapsar mes"><ChevronLeftIcon /></button>
                                            </th>
                                        );
                                    }
                                    return <th key={gi} className={`${styles.th} ${splitCls}`} />;
                                })}
                            </tr>

                            {/* Row 3  Week labels */}
                            <tr>
                                {row3.map((g, gi) => {
                                    const col = g.first;
                                    const isSplit = firstS2ColIdx >= 0 && gi === firstS2Row3;
                                    const splitCls = isSplit ? styles.semSplit : '';
                                    if (col.type !== 'day') return (
                                        <th key={gi} colSpan={g.count} className={`${styles.th} ${styles.thWeek} ${styles.thCollSpacer} ${splitCls}`} />
                                    );
                                    return (
                                        <th key={gi} colSpan={g.count} className={`${styles.th} ${styles.thWeek} ${splitCls}`}>
                                            Semana {col.weekIdx}
                                        </th>
                                    );
                                })}
                            </tr>

                            {/* Row 4  Day labels + dates */}
                            <tr>
                                {displayCols.map((col, ci) => {
                                    const splitCls = firstS2ColIdx >= 0 && ci === firstS2ColIdx ? styles.semSplit : '';
                                    if (col.type !== 'day') return <th key={ci} className={`${styles.th} ${styles.thCollSpacer} ${splitCls}`} />;
                                    return (
                                        <th key={ci} className={`${styles.thDay} ${col.blocked ? styles.thDayBlocked : ''} ${splitCls}`}>
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
                                            const semanaId = col.semestre ? semanaByKey.get(`${col.semestre}-${col.weekDate}`) : undefined;
                                            const dia      = semanaId ? diaMap.get(semanaId)?.get(est.id) : null;
                                            const estado   = dia?.[col.dayKey] ?? null;
                                            return (
                                                <td key={ci}
                                                    className={`${styles.cell} ${col.blocked ? styles.cellBlocked : getCellMod(estado)} ${splitCls}`}
                                                    onClick={col.blocked ? undefined : () => updateDia(col.weekDate, est.id, col.dayKey, cycleEstado(estado), col.semestre ?? undefined)}
                                                    title={col.blocked ? "Fuera de los semestres configurados" : undefined}>
                                                </td>
                                            );
                                        })}
                                        <td className={`${styles.sumTd} ${styles.sumTdP}`}   title={est.nombre_completo}>{t.P || ''}</td>
                                        <td className={`${styles.sumTd} ${styles.sumTdPct}`} title={est.nombre_completo}>{t.pct !== null ? `${t.pct}%` : ''}</td>
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




