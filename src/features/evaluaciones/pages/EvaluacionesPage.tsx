import { useState, useMemo, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEvaluacionesStore } from "../store";
import { useAsignaturasStore } from "../../asignaturas/store";
import type { TemaItem, EvalEntry, EvalCategory, StudentEval, EvalWeights } from "../types";
import { PlusIcon, TrashIcon, EditIcon, ChevronDownIcon, SettingsIcon, FilterIcon, SortIcon, CheckIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "../EvaluacionesPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_CATS: { key: EvalCategory; label: string }[] = [
    { key: "cotidiano", label: "Trabajo Cotidiano" },
    { key: "tareas",    label: "Tareas" },
    { key: "prueba",    label: "Prueba" },
    { key: "proyecto",  label: "Proyecto" },
];

let _seq = 100;
const uid = () => (++_seq).toString();

// ─── Score helpers ────────────────────────────────────────────────────────────
function entryEarned(entry: EvalEntry): number {
    if (entry.items.length === 0) return entry.pct; // ungraded → full marks
    const raw = entry.items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0);
    return Math.min(raw, entry.pct);
}
// Category % = earned / sum_of_entry_pcts (not relative to category weight)
function catPct(entries: EvalEntry[]): number {
    if (entries.length === 0) return 100;
    const maxPts = entries.reduce((s, e) => s + e.pct, 0);
    if (maxPts <= 0) return 100;
    return toPct(entries.reduce((s, e) => s + entryEarned(e), 0), maxPts);
}
function toPct(earned: number, max: number): number {
    if (max <= 0) return 0;
    return Math.round((earned / max) * 100);
}
function asistPct(asistencia: StudentEval["asistencia"]): number {
    const allW = [...asistencia.s1, ...asistencia.s2];
    const td = allW.reduce((a, w) => a + w.dias.length, 0);
    const pr = allW.reduce((a, w) => a + w.dias.filter(Boolean).length, 0);
    return td > 0 ? Math.round((pr / td) * 100) : 100;
}
function calcScore(record: StudentEval, conductaPct: number, weights: EvalWeights): number {
    let total = (conductaPct / 100) * weights.conducta;
    for (const c of ALL_CATS) total += (catPct(record[c.key]) / 100) * weights[c.key];
    total += (asistPct(record.asistencia) / 100) * weights.asistencia;
    return Math.min(100, Math.max(0, Math.round(total)));
}
function calcScorePeriod(record: StudentEval, conductaPct: number, weights: EvalWeights, period: 's1' | 's2'): number {
    let total = (conductaPct / 100) * weights.conducta;
    for (const c of ALL_CATS) {
        const entries = record[c.key].filter((e) => e.semestre === period);
        total += (catPct(entries) / 100) * weights[c.key];
    }
    total += (asistPct(record.asistencia) / 100) * weights.asistencia;
    return Math.min(100, Math.max(0, Math.round(total)));
}
type StudentStatus = "eximido" | "aprobado" | "reprobado";
function getStatus(score: number): StudentStatus {
    if (score >= 90) return "eximido";
    if (score >= 70) return "aprobado";
    return "reprobado";
}
function pctClass(pct: number, hasData: boolean, s: CSSMod) {
    if (!hasData) return "";
    return pct >= 80 ? s.pctGood : pct >= 50 ? s.pctMid : s.pctLow;
}
type CSSMod = typeof import("../EvaluacionesPage.module.css");

const STATUS_LABEL: Record<StudentStatus, string> = { eximido: "Eximido", aprobado: "Aprobado", reprobado: "Reprobado" };
function StatusBadge({ score }: { score: number }) {
    const s = getStatus(score);
    const cls = s === "eximido" ? styles.statusEximido : s === "aprobado" ? styles.statusAprobado : styles.statusReprobado;
    return <span className={cls}>{STATUS_LABEL[s]}</span>;
}


// ─── Conducta Circle ──────────────────────────────────────────────────────────
function ConductaCircle({ pct, onChange }: { pct: number; onChange: (v: number) => void }) {
    const [editing, setEditing] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleMouseLeave = () => { closeTimer.current = setTimeout(() => setEditing(false), 300); };
    const handleMouseEnter = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
    const color = pct >= 80 ? "var(--accent)" : pct >= 50 ? "#f59e0b" : "#ef4444";
    const size  = 40;
    const sw    = 3.5;
    const r     = (size - sw) / 2;
    const circ  = 2 * Math.PI * r;
    const off   = circ * (1 - pct / 100);
    return (
        <div className={styles.conductaWrap} onMouseLeave={handleMouseLeave} onMouseEnter={handleMouseEnter} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.conductaCircle}
                onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }} title={`Conducta: ${pct}%`}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
                        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" />
                </svg>
                <span className={styles.conductaPctVal}>{pct}%</span>
            </button>
            {editing && (
                <div className={styles.conductaPopover} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.conductaPopoverLabel}>Conducta</div>
                    <input type="range" min={0} max={100} step={1} value={pct}
                        className={styles.conductaSlider} onChange={(e) => onChange(Number(e.target.value))} />
                    <div className={styles.conductaPopoverVal}>{pct}%</div>
                </div>
            )}
        </div>
    );
}

// ─── PuntoModal ───────────────────────────────────────────────────────────────
function PuntoModal({ initial, temaName, onSave, onClose }: {
    initial: Partial<TemaItem>; temaName?: string;
    onSave: (item: TemaItem) => void; onClose: () => void;
}) {
    const [tema,        setTema]        = useState(initial.tema        ?? temaName ?? "");
    const [nombre,      setNombre]      = useState(initial.nombre      ?? "");
    const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
    const [valor,       setValor]       = useState(initial.valor       ?? 0);
    const isEdit = Boolean(initial.id);
    const valid  = tema.trim() !== "" && nombre.trim() !== "" && valor > 0;

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="punto-form" className={styles.saveBtn} disabled={!valid}>{isEdit ? "Guardar" : "Agregar"}</button>
        </>
    );
    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar punto" : "Nuevo punto de evaluación"} footer={footer}>
            <form id="punto-form" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}
                onSubmit={(e) => { e.preventDefault(); if (!valid) return; onSave({ id: initial.id ?? uid(), tema: tema.trim(), nombre: nombre.trim(), descripcion: descripcion.trim(), valor, nota: initial.nota ?? 0, notaDescripcion: initial.notaDescripcion ?? "" }); }}>
                {!temaName && (
                    <FormField label="Tema" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Ecosistemas" value={tema}
                            onChange={(e) => setTema(e.target.value)} autoFocus required />
                    </FormField>
                )}
                <div className={styles.row2}>
                    <FormField label="Nombre del punto" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Definición" value={nombre}
                            onChange={(e) => setNombre(e.target.value)} autoFocus={Boolean(temaName)} required />
                    </FormField>
                    <FormField label="Valor máximo (pts)" required>
                        <input className={styles.formInput} type="number" min={0.5} step={0.5} value={valor}
                            onChange={(e) => setValor(Math.max(0, Number(e.target.value)))} required />
                    </FormField>
                </div>
                <FormField label="Descripción">
                    <input className={styles.formInput} type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </FormField>
            </form>
        </Modal>
    );
}

// ─── AddEvalModal — global, applies to student / asignatura / group ───────────
function AddEvalModal({ records, asignaturas, onSave, onClose }: {
    records: StudentEval[];
    asignaturas: { id: string; nombre: string; grupo: number; seccion: number; año: number }[];
    onSave: (recordIds: string[], category: EvalCategory, nombre: string, items: TemaItem[], semestre: 's1' | 's2') => void;
    onClose: () => void;
}) {
    type LocalPunto = { id: string; nombre: string; valor: number };
    type LocalTema  = { id: string; nombre: string; puntos: LocalPunto[] };

    const [cat,        setCat]        = useState<EvalCategory>("prueba");
    const [semestre,   setSemestre]   = useState<'s1' | 's2'>('s1');
    const [nombre,     setNombre]     = useState("");
    const [temas,      setTemas]      = useState<LocalTema[]>([]);
    const [expandedId, setExpandedId] = useState<string>("");
    const [target,     setTarget]     = useState<"estudiante" | "asignatura" | "grupo">("asignatura");
    const [asigId,     setAsigId]     = useState("");
    const [estId,      setEstId]      = useState("");
    const [grupo,      setGrupo]      = useState("");

    const students = useMemo(() => {
        const m = new Map<string, { id: string; nombre: string }>();
        records.forEach((r) => {
            if (r.estudianteId && !m.has(r.estudianteId)) m.set(r.estudianteId, { id: r.estudianteId, nombre: r.nombre });
        });
        return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [records]);

    const grupos = useMemo(() =>
        [...new Set(asignaturas.map((a) => `${a.año} · ${a.grupo} · ${a.seccion}`))].sort(),
        [asignaturas]
    );

    const targetIds = useMemo((): string[] => {
        if (target === "asignatura" && asigId)
            return records.filter((r) => r.asignaturaId === asigId).map((r) => r.id);
        if (target === "estudiante" && estId && asigId)
            return records.filter((r) => r.estudianteId === estId && r.asignaturaId === asigId).map((r) => r.id);
        if (target === "grupo" && grupo) {
            const [yearStr, grpStr, secStr] = grupo.split(" · ");
            const year = Number(yearStr);
            const ids  = new Set(asignaturas.filter((a) => a.año === year && String(a.grupo) === grpStr && String(a.seccion) === secStr).map((a) => a.id));
            return records.filter((r) => ids.has(r.asignaturaId)).map((r) => r.id);
        }
        return [];
    }, [target, asigId, estId, grupo, records, asignaturas]);

    const estAsigs = useMemo(() =>
        estId ? asignaturas.filter((a) => records.some((r) => r.estudianteId === estId && r.asignaturaId === a.id)) : [],
        [estId, asignaturas, records]
    );

    // ── Tema/Punto helpers ──
    const addTema = () => {
        const newId = uid();
        setTemas((t) => [...t, { id: newId, nombre: "", puntos: [] }]);
        setExpandedId(newId);
    };
    const removeTema = (tid: string) => {
        setTemas((t) => {
            const next = t.filter((x) => x.id !== tid);
            return next;
        });
        setExpandedId((cur) => cur === tid ? "" : cur);
    };
    const setTemaNombre = (tid: string, v: string) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, nombre: v } : x));
    const addPunto = (tid: string) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: [...x.puntos, { id: uid(), nombre: "", valor: 0 }] } : x));
    const removePunto = (tid: string, pid: string) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: x.puntos.filter((p) => p.id !== pid) } : x));
    const updatePunto = (tid: string, pid: string, patch: Partial<LocalPunto>) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: x.puntos.map((p) => p.id === pid ? { ...p, ...patch } : p) } : x));

    const totalPts = temas.flatMap((t) => t.puntos).reduce((s, p) => s + p.valor, 0);

    const valid =
        nombre.trim() !== "" &&
        totalPts > 0 &&
        targetIds.length > 0 &&
        temas.length > 0 &&
        temas.every((t) =>
            t.nombre.trim() !== "" &&
            t.puntos.length > 0 &&
            t.puntos.every((p) => p.nombre.trim() !== "" && p.valor > 0)
        );

    const handleSave = (e: FormEvent) => {
        e.preventDefault();
        if (!valid) return;
        const items: TemaItem[] = temas.flatMap((t) =>
            t.puntos.map((p) => ({
                id: uid(),
                tema: t.nombre.trim(),
                nombre: p.nombre.trim(),
                descripcion: "",
                valor: p.valor,
                nota: p.valor,
                notaDescripcion: "",
            }))
        );
        onSave(targetIds, cat, nombre.trim(), items, semestre);
    };

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="addeval-form" className={styles.saveBtn} disabled={!valid}>Añadir evaluación</button>
        </>
    );

    return (
        <Modal open onClose={onClose} title="Añadir evaluación" footer={footer}>
            <form id="addeval-form" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                        {/* Category + Name */}
                        <div className={styles.row2}>
                            <FormField label="Categoría">
                                <select className={styles.formInput} value={cat} onChange={(e) => setCat(e.target.value as EvalCategory)}>
                                    {ALL_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                            </FormField>
                            <FormField label="Nombre" required>
                                <input className={styles.formInput} type="text" placeholder="Ej: Prueba 1" value={nombre}
                                    onChange={(e) => setNombre(e.target.value)} required />
                            </FormField>
                        </div>

                        {/* Semestre */}
                        <FormField label="Semestre">
                            <select className={styles.formInput} value={semestre} onChange={e => setSemestre(e.target.value as 's1' | 's2')}>
                                <option value="s1">Semestre I</option>
                                <option value="s2">Semestre II</option>
                            </select>
                        </FormField>

                        {/* Temas y Puntos builder */}
                        <FormField label="Contenido">
                            <div className={styles.temaBuilderList}>
                                {temas.map((tema, ti) => {
                                    const isOpen = expandedId === tema.id;
                                    const temaPts = tema.puntos.reduce((s, p) => s + p.valor, 0);
                                    const temaOk  = tema.nombre.trim() !== "" && tema.puntos.length > 0 &&
                                        tema.puntos.every((p) => p.nombre.trim() !== "" && p.valor > 0);
                                    return (
                                        <div key={tema.id} className={styles.temaBuilder}>
                                            <div
                                                className={`${styles.temaBuilderHead} ${!isOpen ? styles.temaBuilderHeadCollapsed : ""}`}
                                                onClick={() => isOpen ? (temaOk && setExpandedId("")) : setExpandedId(tema.id)}
                                                style={{ cursor: "pointer" }}
                                            >
                                                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                                                <span className={styles.temaBuilderNum}>Tema {ti + 1}</span>
                                                {!isOpen ? (
                                                    <span className={styles.temaBuilderCollapsedName}>
                                                        {tema.nombre || <em style={{ color: "var(--tx-3)" }}>Sin nombre</em>}
                                                        {temaPts > 0 && <span className={styles.temaBuilderCollapsedPts}> — {temaPts} pts</span>}
                                                    </span>
                                                ) : (
                                                    <input
                                                        className={styles.temaBuilderInput}
                                                        placeholder="Nombre del tema"
                                                        value={tema.nombre}
                                                        onChange={(e) => { e.stopPropagation(); setTemaNombre(tema.id, e.target.value); }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                )}
                                                {temas.length > 1 && (
                                                    <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                                                        onClick={(e) => { e.stopPropagation(); removeTema(tema.id); }}><TrashIcon /></button>
                                                )}
                                            </div>
                                            {isOpen && (
                                                <div className={styles.puntoBuilderRows}>
                                                    {tema.puntos.map((p) => (
                                                        <div key={p.id} className={styles.puntoBuilderRow}>
                                                            <input
                                                                className={styles.puntoBuilderName}
                                                                placeholder="Punto a evaluar"
                                                                value={p.nombre}
                                                                onChange={(e) => updatePunto(tema.id, p.id, { nombre: e.target.value })}
                                                            />
                                                            <input
                                                                className={styles.puntoBuilderVal}
                                                                type="number"
                                                                placeholder="0"
                                                                min={0.5}
                                                                step={0.5}
                                                                value={p.valor || ""}
                                                                onChange={(e) => updatePunto(tema.id, p.id, { valor: Number(e.target.value) })}
                                                            />
                                                            <span className={styles.puntoBuilderPts}>pts</span>
                                                            <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                                                                onClick={() => removePunto(tema.id, p.id)}><TrashIcon /></button>
                                                        </div>
                                                    ))}
                                                    <div className={styles.puntoBuilderFooter}>
                                                        <button type="button" className={styles.builderAddPuntoBtn}
                                                            onClick={() => addPunto(tema.id)}>
                                                            <PlusIcon /> Punto
                                                        </button>
                                                        <button type="button" className={styles.builderSaveBtn}
                                                            disabled={!temaOk}
                                                            onClick={() => setExpandedId("")}>
                                                            Guardar tema
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <button type="button" className={styles.builderAddTemaBtn} onClick={addTema}>
                                    <PlusIcon /> Agregar contenido
                                </button>
                            </div>
                            {totalPts > 0 && (
                                <div className={styles.builderTotal}>
                                    Total: <strong>{totalPts} pts</strong>
                                </div>
                            )}
                        </FormField>

                        {/* Target */}
                        <FormField label="Aplicar a">
                            <select className={styles.formInput} value={target} onChange={(e) => setTarget(e.target.value as "asignatura" | "grupo" | "estudiante")}>
                                {asignaturas.length > 0  && <option value="asignatura">Asignatura</option>}
                                {grupos.length > 0       && <option value="grupo">Grupo</option>}
                                {students.length > 0     && <option value="estudiante">Estudiante</option>}
                            </select>
                        </FormField>
                        {target === "asignatura" && (
                            <FormField label="Asignatura" required>
                                <select className={styles.formInput} value={asigId} onChange={(e) => setAsigId(e.target.value)} required>
                                    <option value="">Selecciona…</option>
                                    {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.grupo} · {a.año}</option>)}
                                </select>
                            </FormField>
                        )}
                        {target === "grupo" && (
                            <FormField label="Grupo" required>
                                <select className={styles.formInput} value={grupo} onChange={(e) => setGrupo(e.target.value)} required>
                                    <option value="">Selecciona…</option>
                                    {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </FormField>
                        )}
                        {target === "estudiante" && (
                            <div className={styles.row2}>
                                <FormField label="Estudiante" required>
                                    <select className={styles.formInput} value={estId} onChange={(e) => { setEstId(e.target.value); setAsigId(""); }} required>
                                        <option value="">Selecciona…</option>
                                        {students.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </FormField>
                                <FormField label="Asignatura" required>
                                    <select className={styles.formInput} value={asigId} onChange={(e) => setAsigId(e.target.value)} required disabled={!estId}>
                                        <option value="">Selecciona…</option>
                                        {estAsigs.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.grupo}</option>)}
                                    </select>
                                </FormField>
                            </div>
                        )}
                        {targetIds.length > 0 && (
                            <div className={styles.targetInfo}>
                                Se añadirá a <strong>{targetIds.length}</strong> registro{targetIds.length !== 1 ? "s" : ""}
                            </div>
                        )}
            </form>
        </Modal>
    );
}

// ─── WeightsModal ─────────────────────────────────────────────────────────────
function WeightsModal({ initial, onSave, onClose }: {
    initial: EvalWeights; onSave: (w: EvalWeights) => void; onClose: () => void;
}) {
    const [w, setW] = useState<EvalWeights>({ ...initial });
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const valid = total === 100;
    const setField = (key: keyof EvalWeights) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setW((p) => ({ ...p, [key]: Math.max(0, Number(e.target.value)) }));
    const labels: Record<keyof EvalWeights, string> = {
        conducta: "Conducta", cotidiano: "Trabajo Cotidiano", tareas: "Tareas",
        prueba: "Prueba", proyecto: "Proyecto", asistencia: "Asistencia",
    };
    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="weights-form" className={styles.saveBtn} disabled={!valid}>Aplicar</button>
        </>
    );
    return (
        <Modal open onClose={onClose} title="Distribución evaluativa" footer={footer}>
            <form id="weights-form" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}
                onSubmit={(e) => { e.preventDefault(); if (!valid) return; onSave(w); }}>
                <div className={styles.row2}>
                    {(Object.keys(labels) as (keyof EvalWeights)[]).map((key) => (
                        <FormField key={key} label={labels[key]}>
                            <input className={styles.formInput} type="number" min={0} max={100} value={w[key]} onChange={setField(key)} />
                        </FormField>
                    ))}
                </div>
                <div className={`${styles.sumLine} ${!valid ? styles.sumWarn : ""}`}>
                    Suma total: <strong>{total}</strong>{!valid && " — debe sumar 100"}
                </div>
            </form>
        </Modal>
    );
}

// ─── TemaGroupRow — collapsible contenido with puntos ────────────────────────
function TemaGroupRow({ temaName, items, onAddPunto, onEditPunto, onDeleteItem, onNotaBlur, onNotaDescBlur }: {
    temaName: string;
    items: TemaItem[];
    onAddPunto: () => void;
    onEditPunto: (item: TemaItem) => void;
    onDeleteItem: (id: string) => void;
    onNotaBlur: (id: string, raw: string) => void;
    onNotaDescBlur: (id: string, val: string) => void;
}) {
    const [open, setOpen] = useState(true);
    const maxT  = items.reduce((s, i) => s + i.valor, 0);
    const notaT = items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0);
    const tPct  = toPct(notaT, maxT);
    const tHas  = items.some((i) => i.nota > 0);
    const tCl   = pctClass(tPct, tHas, styles as unknown as CSSMod);

    return (
        <div className={styles.temaGroup}>
            <div className={styles.temaGroupHead} onClick={() => setOpen(v => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.temaGroupName}>{temaName}</span>
                <span className={styles.temaGroupScore}>
                    {notaT}/{maxT} pts
                    {tHas && <span className={`${styles.temaGroupPct} ${tCl}`}> · {tPct}%</span>}
                </span>
                <button type="button" className={styles.temaAddBtn}
                    onClick={(e) => { e.stopPropagation(); onAddPunto(); }}>
                    <PlusIcon /> Punto
                </button>
            </div>
            {open && (
                <div className={styles.temaItems}>
                    {items.map((item) => (
                        <div key={item.id} className={styles.puntoRow}>
                            <div className={styles.puntoInfo}>
                                <span className={styles.puntoNombre}>{item.nombre}</span>
                                {item.descripcion && <span className={styles.puntoDesc}>{item.descripcion}</span>}
                            </div>
                            <div className={styles.puntoGrade}>
                                <input
                                    key={`${item.id}-nd`}
                                    type="text"
                                    className={styles.notaDescInput}
                                    defaultValue={item.notaDescripcion}
                                    placeholder="Observación..."
                                    onBlur={(e) => onNotaDescBlur(item.id, e.target.value)}
                                />
                                <div className={styles.notaCell}>
                                    <input
                                        key={`${item.id}-${item.nota}`}
                                        type="number"
                                        className={styles.notaInput}
                                        defaultValue={item.nota}
                                        min={0}
                                        max={item.valor}
                                        step={0.5}
                                        onBlur={(e) => onNotaBlur(item.id, e.target.value)}
                                    />
                                    <span className={styles.notaMax}>/{item.valor}</span>
                                </div>
                            </div>
                            <div className={styles.puntoActions}>
                                <button type="button" className={styles.iconBtn} onClick={() => onEditPunto(item)}><EditIcon /></button>
                                <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`} onClick={() => onDeleteItem(item.id)}><TrashIcon /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── EvalEntryRow — temas with multiple puntos ───────────────────────────────
function EvalEntryRow({ entry, onUpdate, onDelete }: {
    entry: EvalEntry;
    onUpdate: (updated: EvalEntry) => void;
    onDelete: (id: string) => void;
}) {
    const [open,       setOpen]       = useState(false);
    const [puntoModal, setPuntoModal] = useState<{ temaName?: string; item?: TemaItem } | null>(null);

    const earned    = entryEarned(entry);
    const pct       = toPct(earned, entry.pct);
    const hasItems  = entry.items.length > 0;

    // Group items by tema
    const temasMap = useMemo(() => {
        const m = new Map<string, TemaItem[]>();
        entry.items.forEach((item) => {
            if (!m.has(item.tema)) m.set(item.tema, []);
            m.get(item.tema)!.push(item);
        });
        return m;
    }, [entry.items]);

    const handleSavePunto = (item: TemaItem) => {
        const isEdit = entry.items.some((i) => i.id === item.id);
        const items  = isEdit ? entry.items.map((i) => (i.id === item.id ? item : i)) : [...entry.items, item];
        onUpdate({ ...entry, items });
        setPuntoModal(null);
    };
    const handleDeleteItem = (id: string) => onUpdate({ ...entry, items: entry.items.filter((i) => i.id !== id) });

    // Inline nota change — save on blur
    const handleNotaBlur = (itemId: string, raw: string) => {
        const item = entry.items.find((i) => i.id === itemId);
        if (!item) return;
        const nota = Math.min(item.valor, Math.max(0, Number(raw) || 0));
        if (nota !== item.nota) onUpdate({ ...entry, items: entry.items.map((i) => i.id === itemId ? { ...i, nota } : i) });
    };
    const handleNotaDescBlur = (itemId: string, val: string) => {
        const item = entry.items.find((i) => i.id === itemId);
        if (!item) return;
        if (val !== item.notaDescripcion) onUpdate({ ...entry, items: entry.items.map((i) => i.id === itemId ? { ...i, notaDescripcion: val } : i) });
    };

    const pc = pctClass(pct, hasItems, styles as unknown as CSSMod);

    return (
        <div className={styles.entryRow}>
            <div className={styles.entryHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.entryName}>{entry.nombre}</span>
                <span className={styles.entryAlloc}>{entry.pct} pts</span>
                {hasItems && <span className={`${styles.entryPct} ${pc}`}>{pct}%</span>}
                <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>
                    <TrashIcon />
                </button>
            </div>

            {open && (
                <div className={styles.entryBody}>
                    {temasMap.size === 0 && <p className={styles.emptyItems}>Sin temas — añade el primer punto</p>}

                    {[...temasMap.entries()].map(([temaName, items]) => (
                        <TemaGroupRow
                            key={temaName}
                            temaName={temaName}
                            items={items}
                            onAddPunto={() => setPuntoModal({ temaName })}
                            onEditPunto={(item) => setPuntoModal({ temaName, item })}
                            onDeleteItem={handleDeleteItem}
                            onNotaBlur={handleNotaBlur}
                            onNotaDescBlur={handleNotaDescBlur}
                        />
                    ))}

                    <div className={styles.entryFooter}>
                        <button type="button" className={styles.addItemBtn} onClick={() => setPuntoModal({})}>
                            <PlusIcon /> Agregar contenido
                        </button>
                        <span className={styles.totalLine}>
                            Total: <strong>{entry.items.reduce((s, i) => s + Math.min(i.nota, i.valor), 0)}</strong>/{entry.pct} pts
                        </span>
                    </div>
                </div>
            )}

            {puntoModal !== null && (
                <PuntoModal
                    initial={puntoModal.item ?? {}}
                    temaName={puntoModal.temaName}
                    onSave={handleSavePunto}
                    onClose={() => setPuntoModal(null)}
                />
            )}
        </div>
    );
}

// ─── CategoryGroup ────────────────────────────────────────────────────────────
function CategoryGroup({ label, catKey, entries, weight, onChange }: {
    label: string; catKey: EvalCategory; entries: EvalEntry[]; weight: number;
    onChange: (entries: EvalEntry[]) => void;
}) {
    const pct     = catPct(entries);
    const hasData = entries.some((e) => e.items.some((i) => i.nota > 0));
    const pc      = pctClass(pct, hasData, styles as unknown as CSSMod);

    const handleUpdate = (updated: EvalEntry) => onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
    const handleDelete = (id: string) => onChange(entries.filter((e) => e.id !== id));

    return (
        <div className={styles.catGroup}>
            <div className={styles.catGroupHead}>
                <span className={styles.catTitle}>{label}</span>
                <div className={styles.catStats}>
                    {hasData && <span className={`${styles.catPct} ${pc}`}>{pct}%</span>}
                    <span className={styles.catWeight}>{weight} pts</span>
                    {entries.length > 0 && (
                        <span className={styles.catAllocNote}>
                            {entries.reduce((s, e) => s + e.pct, 0)}/{weight} asignados
                        </span>
                    )}
                </div>
            </div>

            {entries.length > 0 && (
                <div className={styles.catEntries}>
                    {entries.map((entry) => (
                        <EvalEntryRow key={entry.id} entry={entry} onUpdate={handleUpdate} onDelete={handleDelete} />
                    ))}
                </div>
            )}
            {entries.length === 0 && (
                <div className={styles.catEmpty}>Sin evaluaciones · {weight} pts disponibles</div>
            )}
        </div>
    );
}

// ─── AsignaturaPanel ──────────────────────────────────────────────────────────
function AsignaturaPanel({ record, conductaPct, weights, asigNombre, onUpdate, onDelete }: {
    record: StudentEval; conductaPct: number; weights: EvalWeights;
    asigNombre: string;
    onUpdate: (id: string, patch: Partial<StudentEval>) => void;
    onDelete: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const score  = calcScore(record, conductaPct, weights);
    const scoreS1 = calcScorePeriod(record, conductaPct, weights, 's1');
    const scoreS2 = calcScorePeriod(record, conductaPct, weights, 's2');
    const pc     = pctClass(score, true, styles as unknown as CSSMod);

    return (
        <div className={styles.asigPanel}>
            <div className={styles.asigPanelHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.asigPanelName}>{asigNombre}</span>
                <span className={styles.periodBadges}>
                    <span className={`${styles.periodBadge} ${pctClass(scoreS1, true, styles as unknown as CSSMod)}`}>S1: {scoreS1}%</span>
                    <span className={`${styles.periodBadge} ${pctClass(scoreS2, true, styles as unknown as CSSMod)}`}>S2: {scoreS2}%</span>
                </span>
                <span className={`${styles.asigScore} ${pc}`}>{score}%</span>
                <StatusBadge score={score} />
                <Link to="/app/asistencia" className={styles.asistChip}
                    onClick={(e) => e.stopPropagation()}>
                    {asistPct(record.asistencia)}% asist. →
                </Link>
                <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                    onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}><TrashIcon /></button>
            </div>
            {open && (
                <div className={styles.asigBody}>
                    {ALL_CATS.map((c) => (
                        <CategoryGroup
                            key={c.key}
                            label={c.label}
                            catKey={c.key}
                            entries={record[c.key]}
                            weight={weights[c.key]}
                            onChange={(entries) => onUpdate(record.id, { [c.key]: entries })}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── StudentGroup ─────────────────────────────────────────────────────────────
function StudentGroup({ nombre, estudianteId, records, conductaPct, weights, asigNombreMap, onUpdate, onDelete, onConductaChange }: {
    nombre: string; estudianteId: string;
    records: StudentEval[]; conductaPct: number; weights: EvalWeights;
    asigNombreMap: Record<string, string>;
    onUpdate: (id: string, patch: Partial<StudentEval>) => void;
    onDelete: (id: string) => void;
    onConductaChange: (id: string, pct: number) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className={styles.studentCard}>
            <div className={styles.studentCardHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.studentName}>{nombre}</span>
                <span className={styles.asigLabel}>{records.length} asignatura{records.length !== 1 ? "s" : ""}</span>
                <ConductaCircle pct={conductaPct} onChange={(pct) => onConductaChange(estudianteId, pct)} />
            </div>
            {open && (
                <div className={styles.cardBody}>
                    {records.map((record) => (
                        <AsignaturaPanel key={record.id} record={record} conductaPct={conductaPct}
                            weights={weights} asigNombre={asigNombreMap[record.asignaturaId] ?? record.asignaturaId}
                            onUpdate={onUpdate} onDelete={onDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── EvaluacionesPage ─────────────────────────────────────────────────────────
export function EvaluacionesPage() {
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const records       = useEvaluacionesStore((s) => s.records);
    const cotidianos    = useEvaluacionesStore((s) => s.cotidianos);
    const weights       = useEvaluacionesStore((s) => s.weights);
    const storeUpdate   = useEvaluacionesStore((s) => s.updateRecord);
    const storeDelete   = useEvaluacionesStore((s) => s.deleteRecord);

    const storeConducta = useEvaluacionesStore((s) => s.updateConducta);
    const storeAddEval  = useEvaluacionesStore((s) => s.addEvalEntry);

    const [search,      setSearch]      = useState("");
    const [filterAño,    setFilterAño]    = useState("");
    const [filterGrupo,  setFilterGrupo]  = useState("");
    const [filterAsig,   setFilterAsig]   = useState("");
    const [filterEstado, setFilterEstado] = useState<StudentStatus | "">("");

    const [showAddEval, setShowAddEval] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showSort,    setShowSort]    = useState(false);
    const [sortBy,      setSortBy]      = useState("nombre-asc");

    const SORT_OPTIONS = [
        { value: "nombre-asc",  label: "Nombre A–Z" },
        { value: "nombre-desc", label: "Nombre Z–A" },
        { value: "score-desc",  label: "Mejor nota" },
        { value: "score-asc",   label: "Peor nota"  },
    ];

    const años = useMemo(() => [...new Set(asignaturas.map((a) => a.año))].sort((a, b) => b - a), [asignaturas]);
    const grupos = useMemo(() => {
        const base = filterAño ? asignaturas.filter((a) => a.año === Number(filterAño)) : asignaturas;
        return [...new Set(base.map((a) => a.grupo))].sort();
    }, [asignaturas, filterAño]);
    const filteredAsigs = useMemo(() =>
        asignaturas
            .filter((a) => (!filterAño   || a.año   === Number(filterAño)))
            .filter((a) => (!filterGrupo || a.grupo  === filterGrupo)),
        [asignaturas, filterAño, filterGrupo]
    );

    const filtered = useMemo(() =>
        records.filter((r) => {
            if (filterAsig && r.asignaturaId !== filterAsig) return false;
            if (filterAño || filterGrupo) {
                const a = asignaturas.find((a) => a.id === r.asignaturaId);
                if (!a) return false;
                if (filterAño   && a.año   !== Number(filterAño)) return false;
                if (filterGrupo && a.grupo  !== filterGrupo)       return false;
            }
            return true;
        }),
        [records, filterAsig, filterAño, filterGrupo, asignaturas]
    );

    const conductaMap = useMemo(() => {
        const m = new Map<string, number>();
        cotidianos.forEach((c) => m.set(c.estudianteId, c.conductaPct));
        return m;
    }, [cotidianos]);

    const studentGroups = useMemo(() => {
        const map = new Map<string, { key: string; nombre: string; records: StudentEval[] }>();
        filtered.forEach((r) => {
            const key = r.estudianteId ?? r.id;
            if (!map.has(key)) map.set(key, { key, nombre: r.nombre, records: [] });
            map.get(key)!.records.push(r);
        });
        const q = search.toLowerCase().trim();
        return [...map.values()].filter((g) => !q || g.nombre.toLowerCase().includes(q));
    }, [filtered, search]);

    const activeFilterCount = [filterAño, filterGrupo, filterAsig, filterEstado].filter(Boolean).length;

    const avgScore = (g: { key: string; records: StudentEval[] }) => {
        if (!g.records.length) return 100;
        const cp = conductaMap.get(g.key) ?? 100;
        return g.records.reduce((s, r) => s + calcScore(r, cp, weights), 0) / g.records.length;
    };

    const filteredGroups = useMemo(() => {
        if (!filterEstado) return studentGroups;
        return studentGroups.filter((g) => getStatus(Math.round(avgScore(g))) === filterEstado);
    }, [studentGroups, filterEstado, conductaMap, weights]);

    const sortedGroups = useMemo(() => {
        const arr = [...filteredGroups];
        if (sortBy === "nombre-desc") return arr.sort((a, b) => b.nombre.localeCompare(a.nombre));
        if (sortBy === "score-desc")  return arr.sort((a, b) => {
            const d = avgScore(b) - avgScore(a);
            return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
        });
        if (sortBy === "score-asc")   return arr.sort((a, b) => {
            const d = avgScore(a) - avgScore(b);
            return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
        });
        return arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [filteredGroups, sortBy, conductaMap, weights]);

    const asigNombreMap = useMemo(() => {
        const m: Record<string, string> = {};
        asignaturas.forEach((a) => { m[a.id] = `${a.nombre} · ${a.grupo}`; });
        return m;
    }, [asignaturas]);

    const totalStudents = useMemo(
        () => new Set(records.map((r) => r.estudianteId ?? r.id)).size, [records]
    );

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>Evaluaciones</h2>
                    <p className={styles.countText}>
                        {sortedGroups.length !== totalStudents
                            ? `${sortedGroups.length} de ${totalStudents} estudiante${totalStudents !== 1 ? "s" : ""}`
                            : `${totalStudents} estudiante${totalStudents !== 1 ? "s" : ""}`}
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Link to="/app/configuracion" className={styles.iconBtnToolbar}>
                        <SettingsIcon /> Configuración
                    </Link>
                    <button type="button" className={styles.addEvalBtn} onClick={() => setShowAddEval(true)}>
                        <PlusIcon /> Añadir evaluación
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar estudiante…" width={220} />
                <div className={styles.filterBtnWrap}>
                    <button type="button"
                        className={`${styles.filterToggleBtn}${activeFilterCount > 0 ? ` ${styles.filterToggleActive}` : ""}`}
                        onClick={() => setShowFilters((v) => !v)}>
                        <FilterIcon /> Filtros
                        {activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
                    </button>
                    {showFilters && (
                        <>
                            <div className={styles.filterBackdrop} onClick={() => setShowFilters(false)} />
                            <div className={styles.filterPopover}>
                                <div className={styles.filterPopoverRow}>
                                    <label>Año</label>
                                    <select value={filterAño} onChange={(e) => { setFilterAño(e.target.value); setFilterGrupo(""); setFilterAsig(""); }}>
                                        <option value="">Todos</option>
                                        {años.map((y) => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Grupo</label>
                                    <select value={filterGrupo} onChange={(e) => { setFilterGrupo(e.target.value); setFilterAsig(""); }}>
                                        <option value="">Todos</option>
                                        {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Asignatura</label>
                                    <select value={filterAsig} onChange={(e) => setFilterAsig(e.target.value)}>
                                        <option value="">Todas</option>
                                        {filteredAsigs.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.grupo} · {a.año}</option>)}
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Estado</label>
                                    <select className={styles.filterSelect} value={filterEstado}
                                        onChange={(e) => setFilterEstado(e.target.value as StudentStatus | "")}>
                                        <option value="">Todos</option>
                                        <option value="eximido">Eximido</option>
                                        <option value="aprobado">Aprobado</option>
                                        <option value="reprobado">Reprobado</option>
                                    </select>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button type="button" className={styles.filterClearBtn}
                                        onClick={() => { setFilterAño(""); setFilterGrupo(""); setFilterAsig(""); setFilterEstado(""); }}>
                                        Limpiar filtros
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.filterBtnWrap}>
                    <button type="button"
                        className={`${styles.filterToggleBtn}${sortBy !== "nombre-asc" ? ` ${styles.filterToggleActive}` : ""}`}
                        onClick={() => setShowSort((v) => !v)}>
                        <SortIcon />
                        {SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Ordenar"}
                    </button>
                    {showSort && (
                        <>
                            <div className={styles.filterBackdrop} onClick={() => setShowSort(false)} />
                            <div className={styles.filterPopover}>
                                {SORT_OPTIONS.map((o) => (
                                    <button key={o.value} type="button"
                                        className={`${styles.sortOption}${sortBy === o.value ? ` ${styles.sortOptionActive}` : ""}`}
                                        onClick={() => { setSortBy(o.value); setShowSort(false); }}>
                                        {o.label}
                                        {sortBy === o.value && <CheckIcon className={styles.sortCheckIcon} />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className={styles.body}>
                {studentGroups.length === 0 ? (
                    <EmptyState
                        title={records.length === 0 ? "Sin estudiantes registrados" : "Sin resultados"}
                        subtitle={records.length === 0 ? "Agrega estudiantes en la sección Estudiantes" : "Intenta con otros filtros"}
                    />
                ) : (
                    sortedGroups.map((group) => (
                        <StudentGroup key={group.key} nombre={group.nombre} estudianteId={group.key}
                            records={group.records} conductaPct={conductaMap.get(group.key) ?? 100}
                            weights={weights} asigNombreMap={asigNombreMap}
                            onUpdate={storeUpdate} onDelete={storeDelete} onConductaChange={storeConducta} />
                    ))
                )}
            </div>


            {showAddEval && (
                <AddEvalModal
                    records={records}
                    asignaturas={asignaturas}
                    onSave={(ids, cat, nombre, items, semestre) => { storeAddEval(ids, cat, nombre, items, semestre); setShowAddEval(false); }}
                    onClose={() => setShowAddEval(false)}
                />
            )}
        </div>
    );
}
