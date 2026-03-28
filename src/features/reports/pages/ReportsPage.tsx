import { useState, useMemo, useEffect } from "react";
import { useEvaluacionesStore } from "../../evaluations/store";
import { useAsignaturasStore } from "../../subjects/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import { useConfiguracionStore } from "../../settings/store";
import { getAttendanceStats } from "../../attendance/utils/attendance.utils";
import type { StudentEval, EvalEntry, TemaItem, EvalCategory, EvalWeights } from "../../evaluations/types";
import type { Asignatura } from "../../subjects/types";
import { ExcelIcon, PdfIcon, BackIcon, ChevronDownIcon } from "../../../shared/ui/icons";
import styles from "./ReportsPage.module.css";

//  Types 
type Period = "s1" | "s2" | "anual";
type StudentStatus = "excelente" | "muyBuena" | "regular" | "deficiente";

//  Score helpers 
function entryEarned(entry: EvalEntry): number {
    if (entry.items.length === 0) return entry.pct;
    return Math.min(entry.items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0), entry.pct);
}
function catPct(entries: EvalEntry[]): number {
    if (entries.length === 0) return 100;
    const max = entries.reduce((s, e) => s + e.pct, 0);
    if (max <= 0) return 100;
    return Math.round((entries.reduce((s, e) => s + entryEarned(e), 0) / max) * 100);
}
function catPctPeriod(entries: EvalEntry[], period: Period): number {
    return catPct(period === "anual" ? entries : entries.filter(e => e.semestre === period));
}
function asistPct(asistencia: StudentEval["asistencia"], period: Period): number {
    const weeks = period === "s1" ? asistencia.s1 : period === "s2" ? asistencia.s2 : [...asistencia.s1, ...asistencia.s2];
    return getAttendanceStats(
        weeks.flatMap((week) => week.dias),
        useConfiguracionStore.getState().unjustifiedAbsencesPerFault,
        useConfiguracionStore.getState().tardiesPerFault,
    ).pct;
}
function calcScore(record: StudentEval, conductaPct: number, weights: EvalWeights, period: Period): number {
    let total = (conductaPct / 100) * weights.conducta;
    for (const c of CATS) {
        const entries = period === "anual" ? record[c] : record[c].filter(e => e.semestre === period);
        total += (catPct(entries) / 100) * weights[c];
    }
    total += (asistPct(record.asistencia, period) / 100) * weights.asistencia;
    return Math.min(100, Math.max(0, Math.round(total)));
}
function getStatus(score: number): StudentStatus {
    if (score >= 90) return "excelente";
    if (score >= 80) return "muyBuena";
    if (score >= 70) return "regular";
    return "deficiente";
}

//  Constants 
const PERIOD_OPTS: { value: Period; label: string }[] = [
    { value: "s1",    label: "Semestre I"  },
    { value: "s2",    label: "Semestre II" },
    { value: "anual", label: "Anual"       },
];
const CAT_LABELS: Record<EvalCategory, string> = {
    cotidiano: "Trabajo Cotidiano",
    tareas:    "Tareas",
    prueba:    "Prueba",
    proyecto:  "Proyecto",
};
const STATUS_LABELS: Record<StudentStatus, string> = {
    excelente:  "Excelente",
    muyBuena:   "Muy buena",
    regular:    "Regular",
    deficiente: "Deficiente",
};
const STATUS_CLASS: Record<StudentStatus, string> = {
    excelente:  "statusExcelente",
    muyBuena:   "statusMuyBuena",
    regular:    "statusRegular",
    deficiente: "statusDeficiente",
};
const CATS: EvalCategory[] = ["cotidiano", "tareas", "prueba", "proyecto"];

//  Icons 
const ChevronIcon = ({ open }: { open: boolean }) => (
    <ChevronDownIcon width="12" height="12"
        style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
);

//  Shared sub-components 
function StatusBadge({ score }: { score: number }) {
    const s = getStatus(score);
    return <span className={styles[STATUS_CLASS[s] as keyof typeof styles]}>{STATUS_LABELS[s]}</span>;
}

function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
    return (
        <div className={styles.periodTabs}>
            {PERIOD_OPTS.map(o => (
                <button key={o.value} type="button"
                    className={`${styles.periodTab}${value === o.value ? ` ${styles.periodTabActive}` : ""}`}
                    onClick={() => onChange(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function ExportButtons() {
    return (
        <div className={styles.exportBtns}>
            <button type="button" className={styles.exportBtn} disabled title="Prximamente">
                <ExcelIcon /> Excel
            </button>
            <button type="button" className={styles.exportBtn} disabled title="Prximamente">
                <PdfIcon /> PDF
            </button>
        </div>
    );
}

//  Detail: Item row 
function ItemRow({ item }: { item: TemaItem }) {
    const earned = Math.min(item.nota, item.valor);
    return (
        <div className={styles.itemRow}>
            <div className={styles.itemInfo}>
                <span className={styles.itemNombre}>{item.descripcion || item.nombre}</span>
                <span className={styles.itemRazon}>{item.notaDescripcion || ""}</span>
            </div>
            <span className={styles.itemScoreNum}>
                {earned}/{item.valor}
            </span>
        </div>
    );
}

//  Detail: Tema group (collapsible) 
function TemaGroup({ tema, items }: { tema: string; items: TemaItem[] }) {
    const [open, setOpen] = useState(false);
    const earned = items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0);
    const max    = items.reduce((s, i) => s + i.valor, 0);
    return (
        <div className={styles.temaGroup}>
            <div className={styles.temaLabel} onClick={() => setOpen(v => !v)}>
                <ChevronIcon open={open} />
                <span>{tema}</span>
                <span className={styles.temaScore}>
                    {earned}/{max}
                </span>
            </div>
            {open && (
                <div className={styles.itemList}>
                    {items.map(item => <ItemRow key={item.id} item={item} />)}
                </div>
            )}
        </div>
    );
}

//  Detail: Entry section (collapsible) 
function EntrySection({ entry }: { entry: EvalEntry }) {
    const [open, setOpen] = useState(false);

    const earned = entryEarned(entry);
    const pct    = entry.pct > 0 ? Math.round((earned / entry.pct) * 100) : 0;

    const temaGroups = useMemo(() => {
        const m = new Map<string, TemaItem[]>();
        for (const item of entry.items) {
            if (!m.has(item.tema)) m.set(item.tema, []);
            m.get(item.tema)!.push(item);
        }
        return [...m.entries()];
    }, [entry.items]);

    return (
        <div className={styles.entrySection}>
            <div className={styles.entrySectionHead} onClick={() => setOpen(v => !v)}>
                <ChevronIcon open={open} />
                <span className={styles.entrySectionName}>{entry.nombre}</span>
                <span className={styles.entrySectionPct}>
                    {pct}%
                </span>
            </div>
            {open && (
                <div className={styles.entrySectionBody}>
                    {temaGroups.length === 0 ? (
                        <div className={styles.entryEmpty}>Sin puntos registrados</div>
                    ) : (
                        temaGroups.map(([tema, items]) => (
                            <TemaGroup key={tema} tema={tema} items={items} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

//  Detail: Category section (collapsible) 
function CategorySection({ cat, entries, period }: { cat: EvalCategory; entries: EvalEntry[]; period: Period }) {
    const [open, setOpen] = useState(false);
    const filtered = period === "anual" ? entries : entries.filter(e => e.semestre === period);
    const pct = catPct(filtered);

    return (
        <div className={styles.catSection}>
            <div className={styles.catSectionHead} onClick={() => setOpen(v => !v)}>
                <ChevronIcon open={open} />
                <span className={styles.catSectionLabel}>{CAT_LABELS[cat]}</span>
                <span className={`${styles.catSectionPct} ${pct >= 80 ? styles.pctGood : pct >= 50 ? styles.pctMid : styles.pctLow}`}>
                    {pct}%
                </span>
                <span className={styles.catSectionCount}>
                    {filtered.length} evaluacin{filtered.length !== 1 ? "es" : ""}
                </span>
            </div>
            {open && (
                <div className={styles.catSectionBody}>
                    {filtered.length === 0 ? (
                        <div className={styles.catEmpty}>Sin evaluaciones para este perodo</div>
                    ) : (
                        filtered.map(entry => <EntrySection key={entry.id} entry={entry} />)
                    )}
                </div>
            )}
        </div>
    );
}

//  Detail View 
function DetailView({
    record, conductaPct, weights, asig, onBack,
}: {
    record:      StudentEval;
    conductaPct: number;
    weights:     EvalWeights;
    asig:        Asignatura | undefined;
    onBack:      () => void;
}) {
    const [period, setPeriod] = useState<Period>("anual");
    const asistScore = asistPct(record.asistencia, period);
    const score = calcScore(record, conductaPct, weights, period);

    return (
        <div className={styles.page}>
            {/*  Detail header  */}
            <div className={styles.detailHeader}>
                <button type="button" className={styles.backBtn} onClick={onBack}>
                    <BackIcon /> Volver
                </button>
                <div className={styles.detailStudentInfo}>
                    <span className={styles.detailName}>{record.nombre}</span>
                    {asig && (
                        <span className={styles.detailAsig}>
                            {asig.nombre} {asig.grupo}-{asig.seccion} ({asig.year})
                        </span>
                    )}
                </div>
            </div>

            {/*  Toolbar  */}
            <div className={styles.toolbar}>
                <PeriodTabs value={period} onChange={setPeriod} />
            </div>

            {/*  Summary strip  */}
            <div className={styles.summaryStrip}>
                <div className={styles.stripCell}>
                    <span className={styles.stripLabel}>Conducta</span>
                    <span className={styles.stripVal}>{conductaPct}%</span>
                </div>
                {CATS.map(cat => (
                    <div key={cat} className={styles.stripCell}>
                        <span className={styles.stripLabel}>{CAT_LABELS[cat]}</span>
                        <span className={styles.stripVal}>{catPctPeriod(record[cat], period)}%</span>
                    </div>
                ))}
                <div className={styles.stripCell}>
                    <span className={styles.stripLabel}>Asistencia</span>
                    <span className={styles.stripVal}>{asistScore}%</span>
                </div>
                <div className={`${styles.stripCell} ${styles.stripCellTotal}`}>
                    <span className={styles.stripLabel}>Total</span>
                    <span className={styles.stripVal}>{score}</span>
                </div>
            </div>

            {/*  Hierarchy tree  */}
            <div className={styles.detailTree}>
                {/* Conducta row */}
                <div className={styles.fixedCatRow}>
                    <span className={styles.fixedCatLabel}>Conducta</span>
                    <span className={styles.fixedCatPct}>{conductaPct}%</span>
                    <span className={styles.fixedCatNote}>Personal  no editable por asignatura</span>
                </div>
                {/* Eval categories */}
                {CATS.map(cat => (
                    <CategorySection key={cat} cat={cat} entries={record[cat]} period={period} />
                ))}
                {/* Asistencia row */}
                <div className={styles.fixedCatRow}>
                    <span className={styles.fixedCatLabel}>Asistencia</span>
                    <span className={styles.fixedCatPct}>{asistScore}%</span>
                </div>
            </div>
            <div className={styles.tableActionsRow}>
                <ExportButtons />
            </div>
        </div>
    );
}

//  Nivel names 
const NIVEL_NAMES: Record<number, string> = {
    1: "Primero", 2: "Segundo", 3: "Tercero", 4: "Cuarto",
    5: "Quinto",  6: "Sexto",   7: "Stimo",  8: "Octavo",
    9: "Noveno",  10: "Dcimo", 11: "Undcimo", 12: "Duodcimo",
};
function nivelLabel(grupo: number): string {
    if (grupo === 7) return "Setimo";
    if (grupo === 10) return "Decimo";
    if (grupo === 11) return "Undecimo";
    if (grupo === 12) return "Duodecimo";
    return NIVEL_NAMES[grupo] ?? `Grupo ${grupo}`;
}

//  Alertas view 
function AlertasNotaView({ period }: { period: Period }) {
    const { records, cotidianos, weights } = useEvaluacionesStore();
    const asignaturas  = useAsignaturasStore(s => s.asignaturas);
    const institution  = useInstitutionStore(selectCurrentInstitution);
    const cfg          = useConfiguracionStore();

    const thresholds = useMemo(() => {
        const values = cfg.umbralPromedio
            .map(u => u.valor)
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .sort((a, b) => a - b);
        return values.length > 0 ? values : [70];
    }, [cfg.umbralPromedio]);
    const [selected,  setSelected]  = useState<Set<string>>(new Set());

    const conductaMap = useMemo(() => {
        const m = new Map<string, number>();
        cotidianos.forEach(c => m.set(c.estudianteId, c.conductaPct));
        return m;
    }, [cotidianos]);

    const rows = useMemo(() => {
        return asignaturas.flatMap(asig => {
            const asigRecords = records.filter(r => r.asignaturaId === asig.id);
            if (asigRecords.length === 0) return [];
            const scores = asigRecords.map(r => {
                const estId = r.estudianteId ?? r.id;
                return calcScore(r, conductaMap.get(estId) ?? 100, weights, period);
            });
            return thresholds.map(threshold => {
                const below = scores.filter(s => s < threshold).length;
                return {
                    id: `${asig.id}-${threshold}`,
                    asignaturaId: asig.id,
                    nivel: Math.trunc(asig.grupo),
                    grupo: Math.trunc(asig.seccion),
                    asignatura: asig.nombre,
                    total: scores.length,
                    threshold,
                    below,
                    pct: Math.round((below / scores.length) * 100),
                };
            });
        })
          .sort((a, b) => a.nivel - b.nivel || a.grupo - b.grupo || a.asignatura.localeCompare(b.asignatura));
    }, [asignaturas, records, conductaMap, weights, period, thresholds]);

    const toggleRow = (id: string) =>
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));

    return (
        <div>
            {rows.length === 0 ? (
                <div className={styles.empty}>
                    <p>Sin datos de evaluaciones</p>
                    <span>Agrega evaluaciones para ver este reporte.</span>
                </div>
            ) : (
                <>
                    <div className={styles.tableWrap}>
                    <table className={styles.summaryTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 32 }}>
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                                </th>
                                <th className={styles.thName}>Region</th>
                                <th>Circuito</th>
                                <th className={styles.thName}>Institucion</th>
                                <th className={styles.thName}>Modalidad</th>
                                <th className={styles.thName}>Nivel</th>
                                <th>Grupo</th>
                                <th className={styles.thName}>Asignatura</th>
                                <th className={styles.thName}>% ESTUDIANTES BAJO NOTA MINIMA</th>
                                <th># DE ESTUDIANTES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                return (
                                    <tr key={row.id} className={styles.summaryRow}>
                                        <td>
                                            <input type="checkbox" checked={selected.has(row.id)}
                                                onChange={() => toggleRow(row.id)} />
                                        </td>
                                        <td className={styles.tdNameBody}>{institution.direccionRegional ?? "-"}</td>
                                        <td className={styles.tdStat}>{institution.circuito ?? "-"}</td>
                                        <td className={styles.tdNameBody}>{institution.name}</td>
                                        <td className={styles.tdNameBody}>{institution.tipoInstitucion ?? "-"}</td>
                                        <td className={styles.tdNameBody}>{nivelLabel(row.nivel)}</td>
                                        <td className={styles.tdStat}>{row.grupo}</td>
                                        <td className={styles.tdNameBody}>{row.asignatura}</td>
                                        <td className={styles.tdStat}>
                                            {row.pct > 0 ? `${row.threshold}% ${row.pct}%` : `${row.threshold}%`}
                                        </td>
                                        <td className={styles.tdStat}>{row.below}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className={styles.tableActionsRow}>
                    <ExportButtons />
                </div>
                </>
            )}
        </div>
    );
}

//  Page 
export function ReportsPage() {
    const asignaturas  = useAsignaturasStore(s => s.asignaturas);
    const { records, cotidianos, weights, load } = useEvaluacionesStore();
    const institution  = useInstitutionStore(selectCurrentInstitution);

    const [selectedAsigId,   setSelectedAsigId]   = useState("");
    const [period,           setPeriod]           = useState<Period>("anual");
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const [view,             setView]             = useState<"reporte" | "alertas">("reporte");

    useEffect(() => { if (institution.id) load(institution.id); }, [institution.id]);

    const asigId = selectedAsigId || asignaturas[0]?.id || "";
    const asig   = asignaturas.find(a => a.id === asigId);

    const filteredRecords = useMemo(
        () => records.filter(r => r.asignaturaId === asigId),
        [records, asigId]
    );

    const conductaMap = useMemo(() => {
        const m = new Map<string, number>();
        cotidianos.forEach(c => m.set(c.estudianteId, c.conductaPct));
        return m;
    }, [cotidianos]);

    //  Detail view 
    if (selectedRecordId) {
        const rec = records.find(r => r.id === selectedRecordId);
        if (rec) {
            const estId = rec.estudianteId ?? rec.id;
            return (
                <DetailView
                    record={rec}
                    conductaPct={conductaMap.get(estId) ?? 100}
                    weights={weights}
                    asig={asig}
                    onBack={() => setSelectedRecordId(null)}
                />
            );
        }
    }

    //  List view 
    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>Reportes</h2>
                    <p className={styles.countText}>
                        {view === "reporte"
                            ? `${filteredRecords.length} estudiante${filteredRecords.length !== 1 ? "s" : ""}`
                            : "Alerta: estudiantes bajo nota mnima"}
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                {view === "reporte" && (
                    <select className={styles.asigSelect} value={asigId}
                        onChange={e => { setSelectedAsigId(e.target.value); setSelectedRecordId(null); }}>
                        {asignaturas.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.nombre} {a.grupo}-{a.seccion} ({a.year})
                            </option>
                        ))}
                    </select>
                )}
                <PeriodTabs value={period} onChange={setPeriod} />
                <div className={styles.viewTabsInline}>
                    <div className={styles.viewTabs}>
                        <button type="button"
                            className={`${styles.viewTab}${view === "reporte" ? ` ${styles.viewTabActive}` : ""}`}
                            onClick={() => setView("reporte")}>
                            Reporte
                        </button>
                        <button type="button"
                            className={`${styles.viewTab}${view === "alertas" ? ` ${styles.viewTabActive}` : ""}`}
                            onClick={() => setView("alertas")}>
                            Alerta
                        </button>
                    </div>
                </div>
            </div>

            {/* Alertas view */}
            {view === "alertas" && <AlertasNotaView period={period} />}

            {/* Summary table */}
            {view === "alertas" ? null : filteredRecords.length === 0 ? (
                <div className={styles.empty}>
                    <p>Sin estudiantes en esta asignatura</p>
                    <span>Agrega evaluaciones desde la seccion de Evaluaciones.</span>
                </div>
            ) : (
                <>
                    <div className={styles.tableWrap}>
                        <table className={styles.summaryTable}>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th className={styles.thName}>Apellidos y Nombre</th>
                                <th>Conducta</th>
                                <th>Cot.</th>
                                <th>Tareas</th>
                                <th>Prueba</th>
                                <th>Proyecto</th>
                                <th>Asist.</th>
                                <th className={styles.thTotal}>Total</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((rec, idx) => {
                                const estId = rec.estudianteId ?? rec.id;
                                const cp    = conductaMap.get(estId) ?? 100;
                                const score = calcScore(rec, cp, weights, period);
                                return (
                                    <tr key={rec.id} className={styles.summaryRow}
                                        onClick={() => setSelectedRecordId(rec.id)}
                                        title="Ver reporte detallado">
                                        <td className={styles.tdIdx}>{idx + 1}</td>
                                        <td className={styles.tdNameBody}>{rec.nombre}</td>
                                        <td className={styles.tdStat}>{cp}%</td>
                                        <td className={styles.tdStat}>{catPctPeriod(rec.cotidiano, period)}%</td>
                                        <td className={styles.tdStat}>{catPctPeriod(rec.tareas, period)}%</td>
                                        <td className={styles.tdStat}>{catPctPeriod(rec.prueba, period)}%</td>
                                        <td className={styles.tdStat}>{catPctPeriod(rec.proyecto, period)}%</td>
                                        <td className={styles.tdStat}>{asistPct(rec.asistencia, period)}%</td>
                                        <td className={`${styles.tdTotal} ${score >= 90 ? styles.totalExcelente : score >= 80 ? styles.totalMuyBuena : score >= 70 ? styles.totalRegular : styles.totalDeficiente}`}>
                                            {score}
                                        </td>
                                        <td className={styles.tdStat}><StatusBadge score={score} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        </table>
                    </div>
                    <div className={styles.tableActionsRow}>
                        <ExportButtons />
                    </div>
                </>
            )}
        </div>
    );
}



