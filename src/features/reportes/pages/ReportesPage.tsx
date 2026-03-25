import { useState, useMemo, useEffect } from "react";
import { useEvaluacionesStore } from "../../evaluaciones/store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import type { StudentEval, EvalEntry, TemaItem, EvalCategory, EvalWeights } from "../../evaluaciones/types";
import type { Asignatura } from "../../asignaturas/types";
import { ExcelIcon, PdfIcon, BackIcon, ChevronDownIcon } from "../../../shared/ui/icons";
import styles from "../ReportesPage.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = "s1" | "s2" | "anual";
type StudentStatus = "eximido" | "aprobado" | "reprobado";

// ─── Score helpers ────────────────────────────────────────────────────────────
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
    const total   = weeks.reduce((a, w) => a + w.dias.length, 0);
    const present = weeks.reduce((a, w) => a + w.dias.filter(Boolean).length, 0);
    return total > 0 ? Math.round((present / total) * 100) : 100;
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
    if (score >= 90) return "eximido";
    if (score >= 70) return "aprobado";
    return "reprobado";
}

// ─── Constants ────────────────────────────────────────────────────────────────
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
    eximido:   "Eximido",
    aprobado:  "Aprobado",
    reprobado: "Reprobado",
};
const CATS: EvalCategory[] = ["cotidiano", "tareas", "prueba", "proyecto"];

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronIcon = ({ open }: { open: boolean }) => (
    <ChevronDownIcon width="12" height="12"
        style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
);

// ─── Shared sub-components ────────────────────────────────────────────────────
function StatusBadge({ score }: { score: number }) {
    const s   = getStatus(score);
    const cls = s === "eximido" ? styles.statusEximido : s === "aprobado" ? styles.statusAprobado : styles.statusReprobado;
    return <span className={cls}>{STATUS_LABELS[s]}</span>;
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
            <button type="button" className={styles.exportBtn} disabled title="Próximamente">
                <ExcelIcon /> Excel
            </button>
            <button type="button" className={styles.exportBtn} disabled title="Próximamente">
                <PdfIcon /> PDF
            </button>
        </div>
    );
}

// ─── Detail: Item row ─────────────────────────────────────────────────────────
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

// ─── Detail: Tema group (collapsible) ────────────────────────────────────────
function TemaGroup({ tema, items }: { tema: string; items: TemaItem[] }) {
    const [open, setOpen] = useState(false);
    const earned = items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0);
    const max    = items.reduce((s, i) => s + i.valor, 0);
    const pct    = max > 0 ? Math.round((earned / max) * 100) : 0;
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

// ─── Detail: Entry section (collapsible) ─────────────────────────────────────
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

// ─── Detail: Category section (collapsible) ──────────────────────────────────
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
                    {filtered.length} evaluación{filtered.length !== 1 ? "es" : ""}
                </span>
            </div>
            {open && (
                <div className={styles.catSectionBody}>
                    {filtered.length === 0 ? (
                        <div className={styles.catEmpty}>Sin evaluaciones para este período</div>
                    ) : (
                        filtered.map(entry => <EntrySection key={entry.id} entry={entry} />)
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
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
    const score      = calcScore(record, conductaPct, weights, period);
    const asistScore = asistPct(record.asistencia, period);

    return (
        <div className={styles.page}>
            {/* ── Detail header ── */}
            <div className={styles.detailHeader}>
                <button type="button" className={styles.backBtn} onClick={onBack}>
                    <BackIcon /> Volver
                </button>
                <div className={styles.detailStudentInfo}>
                    <span className={styles.detailName}>{record.nombre}</span>
                    {asig && (
                        <span className={styles.detailAsig}>
                            {asig.nombre} · Grupo {asig.grupo} · Sección {asig.seccion}
                        </span>
                    )}
                </div>
                <div className={styles.detailScoreBadge}>
                    <span className={styles.detailScoreNum}>{score}</span>
                    <StatusBadge score={score} />
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className={styles.toolbar}>
                <PeriodTabs value={period} onChange={setPeriod} />
                <ExportButtons />
            </div>

            {/* ── Summary strip ── */}
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

            {/* ── Hierarchy tree ── */}
            <div className={styles.detailTree}>
                {/* Conducta row */}
                <div className={styles.fixedCatRow}>
                    <span className={styles.fixedCatLabel}>Conducta</span>
                    <span className={styles.fixedCatPct}>{conductaPct}%</span>
                    <span className={styles.fixedCatNote}>Personal · no editable por asignatura</span>
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
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function ReportesPage() {
    const asignaturas  = useAsignaturasStore(s => s.asignaturas);
    const { records, cotidianos, weights, load } = useEvaluacionesStore();
    const institution  = useInstitutionStore(selectCurrentInstitution);

    const [selectedAsigId,   setSelectedAsigId]   = useState("");
    const [period,           setPeriod]           = useState<Period>("anual");
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

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

    // ── Detail view ───────────────────────────────────────────────────────────
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

    // ── List view ─────────────────────────────────────────────────────────────
    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>Reportes</h2>
                    <p className={styles.countText}>
                        {filteredRecords.length} estudiante{filteredRecords.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <ExportButtons />
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <select className={styles.asigSelect} value={asigId}
                    onChange={e => { setSelectedAsigId(e.target.value); setSelectedRecordId(null); }}>
                    {asignaturas.map(a => (
                        <option key={a.id} value={a.id}>
                            {a.nombre} · Grupo {a.grupo} · Sección {a.seccion}
                        </option>
                    ))}
                </select>
                <PeriodTabs value={period} onChange={setPeriod} />
            </div>

            {/* Summary table */}
            {filteredRecords.length === 0 ? (
                <div className={styles.empty}>
                    <p>Sin estudiantes en esta asignatura</p>
                    <span>Agrega evaluaciones desde la sección de Evaluaciones.</span>
                </div>
            ) : (
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
                                        <td className={`${styles.tdTotal} ${score >= 90 ? styles.totalEximido : score >= 70 ? styles.totalAprobado : styles.totalReprobado}`}>
                                            {score}
                                        </td>
                                        <td><StatusBadge score={score} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
