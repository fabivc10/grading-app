import { useState, useMemo, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEvaluacionesStore } from "../store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useConfiguracionStore, DEFAULT_NIVEL_CONFIG, DEFAULT_RANGO_NUMERICA, DEFAULT_RANGO_ANALITICA } from "../../configuracion/store";
import type { TemaItem, EvalEntry, EvalCategory, EvalTipo, StudentEval, NivelConfig } from "../types";
import { PlusIcon, TrashIcon, EditIcon, ChevronDownIcon, SettingsIcon, FilterIcon, SortIcon, CheckIcon, UsersIcon } from "../../../shared/ui/icons";
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
function applyAusenciasRebaja(total: number, record: StudentEval): number {
    const { umbralAusencias } = useConfiguracionStore.getState();
    const absencePct = 100 - asistPct(record.asistencia);
    const penalty = umbralAusencias.filter(u =>
        u.dir === ">" ? absencePct > u.valor : absencePct < u.valor
    ).length;
    return total - penalty;
}
function calcScore(record: StudentEval, _conductaPct: number, cfg: NivelConfig): number {
    let total = 0;
    for (const c of ALL_CATS) {
        const w = c.key === "proyecto" && cfg.numProyectos === 0 ? 0 : cfg[c.key];
        total += (catPct(record[c.key]) / 100) * w;
    }
    total += (asistPct(record.asistencia) / 100) * cfg.asistencia;
    return Math.min(100, Math.max(0, Math.round(applyAusenciasRebaja(total, record))));
}
function calcScorePeriod(record: StudentEval, _conductaPct: number, cfg: NivelConfig, period: 's1' | 's2'): number {
    let total = 0;
    for (const c of ALL_CATS) {
        const entries = record[c.key].filter((e) => e.semestre === period);
        const w = c.key === "proyecto" && cfg.numProyectos === 0 ? 0 : cfg[c.key];
        total += (catPct(entries) / 100) * w;
    }
    total += (asistPct(record.asistencia) / 100) * cfg.asistencia;
    return Math.min(100, Math.max(0, Math.round(applyAusenciasRebaja(total, record))));
}

// ── Academic status (for badge + group breakdown + filter) ─────────────────────
type AcademicStatus = "eximido" | "aprobado" | "convocatoria" | "reprobado";
function getAcademicStatus(score: number): AcademicStatus {
    if (score >= 90) return "eximido";
    if (score >= 70) return "aprobado";
    if (score >= 65) return "convocatoria";
    return "reprobado";
}
const ACADEMIC_LABEL: Record<AcademicStatus, string> = {
    eximido:      "Eximido",
    aprobado:     "Aprobado",
    convocatoria: "Convocatoria",
    reprobado:    "Reprobado",
};
const ACADEMIC_CLASS: Record<AcademicStatus, string> = {
    eximido:      "statusExcelente",
    aprobado:     "statusMuyBuena",
    convocatoria: "statusRegular",
    reprobado:    "statusDeficiente",
};
function StatusBadge({ score }: { score: number }) {
    const s = getAcademicStatus(score);
    return <span className={styles[ACADEMIC_CLASS[s] as keyof typeof styles]}>{ACADEMIC_LABEL[s]}</span>;
}

function pctClass(pct: number, hasData: boolean, s: CSSMod) {
    if (!hasData) return "";
    return pct >= 80 ? s.pctGood : pct >= 50 ? s.pctMid : s.pctLow;
}
type CSSMod = typeof import("../EvaluacionesPage.module.css");


// ─── Conducta Chip ────────────────────────────────────────────────────────────
function ConductaChip({ pct, onChange }: { pct: number; onChange: (v: number) => void }) {
    const [editing, setEditing] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleMouseLeave = () => { closeTimer.current = setTimeout(() => setEditing(false), 300); };
    const handleMouseEnter = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
    const statusCls = styles[ACADEMIC_CLASS[getAcademicStatus(pct)] as keyof typeof styles];
    return (
        <div className={styles.conductaWrap} onMouseLeave={handleMouseLeave} onMouseEnter={handleMouseEnter} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={`${styles.conductaChip} ${statusCls}`}
                onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}>
                Conducta: {pct}%
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
function PuntoModal({ initial, temaName, tipo, onSave, onClose }: {
    initial: Partial<TemaItem>; temaName?: string;
    tipo?: EvalTipo;
    onSave: (item: TemaItem) => void; onClose: () => void;
}) {
    const rangoNumerica  = useConfiguracionStore(s => s.rangoNumerica)  ?? DEFAULT_RANGO_NUMERICA;
    const rangoAnalitica = useConfiguracionStore(s => s.rangoAnalitica) ?? DEFAULT_RANGO_ANALITICA;
    const rango = tipo === "analitica" ? rangoAnalitica : rangoNumerica;

    const [tema,        setTema]        = useState(initial.tema        ?? temaName ?? "");
    const [nombre,      setNombre]      = useState(initial.nombre      ?? "");
    const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
    const [valor,       setValor]       = useState(initial.valor       ?? rango.max);
    const isEdit = Boolean(initial.id);
    const valid  = tema.trim() !== "" && nombre.trim() !== "" && valor > 0;

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="punto-form" className={styles.saveBtn} disabled={!valid}>{isEdit ? "Guardar" : "Agregar"}</button>
        </>
    );
    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar indicador" : "Nuevo indicador de evaluación"} footer={footer}>
            <form id="punto-form" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}
                onSubmit={(e) => { e.preventDefault(); if (!valid) return; onSave({ id: initial.id ?? uid(), tema: tema.trim(), nombre: nombre.trim(), descripcion: descripcion.trim(), valor, nota: initial.nota ?? valor, notaDescripcion: initial.notaDescripcion ?? "" }); }}>
                {!temaName && (
                    <FormField label="Contenido" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Ecosistemas" value={tema}
                            onChange={(e) => setTema(e.target.value)} autoFocus required />
                    </FormField>
                )}
                <div className={styles.row2}>
                    <FormField label="Nombre del indicador" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Definición" value={nombre}
                            onChange={(e) => setNombre(e.target.value)} autoFocus={Boolean(temaName)} required />
                    </FormField>
                    <FormField label="Valor máximo (pts)" required>
                        <input className={styles.formInput} type="number"
                            min={rango.min} max={rango.max} step={1} value={valor}
                            onChange={(e) => setValor(Math.min(rango.max, Math.max(rango.min, Number(e.target.value))))} required />
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
    onSave: (recordIds: string[], category: EvalCategory, nombre: string, items: TemaItem[], semestre: 's1' | 's2', tipo: EvalTipo) => void;
    onClose: () => void;
}) {
    type LocalPunto = { id: string; nombre: string; valor: number };
    type LocalTema  = { id: string; nombre: string; puntos: LocalPunto[] };

    const rangoNumerica  = useConfiguracionStore(s => s.rangoNumerica)  ?? DEFAULT_RANGO_NUMERICA;
    const rangoAnalitica = useConfiguracionStore(s => s.rangoAnalitica) ?? DEFAULT_RANGO_ANALITICA;

    const [cat,        setCat]        = useState<EvalCategory>("prueba");
    const [tipo,       setTipo]       = useState<EvalTipo>("numerica");
    const [semestre,   setSemestre]   = useState<'s1' | 's2'>('s1');
    const [nombre,     setNombre]     = useState("");
    const [temas,      setTemas]      = useState<LocalTema[]>([]);
    const [expandedId, setExpandedId] = useState<string>("");
    const [target,     setTarget]     = useState<"estudiante" | "asignatura" | "grupo">("asignatura");
    const [asigId,     setAsigId]     = useState(asignaturas[0]?.id ?? "");
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
    const addPunto = (tid: string) => {
        const rango = tipo === "analitica" ? rangoAnalitica : rangoNumerica;
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: [...x.puntos, { id: uid(), nombre: "", valor: rango.max }] } : x));
    };
    const removePunto = (tid: string, pid: string) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: x.puntos.filter((p) => p.id !== pid) } : x));
    const updatePunto = (tid: string, pid: string, patch: Partial<LocalPunto>) =>
        setTemas((t) => t.map((x) => x.id === tid ? { ...x, puntos: x.puntos.map((p) => p.id === pid ? { ...p, ...patch } : p) } : x));

    const totalPts = temas.flatMap((t) => t.puntos).reduce((s, p) => s + p.valor, 0);

    const temasIncompletos = temas.length > 0 && !temas.every((t) =>
        t.nombre.trim() !== "" &&
        t.puntos.length > 0 &&
        t.puntos.every((p) => p.nombre.trim() !== "" && p.valor > 0)
    );
    const valid =
        nombre.trim() !== "" &&
        totalPts > 0 &&
        targetIds.length > 0 &&
        temas.length > 0 &&
        !temasIncompletos;

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
        onSave(targetIds, cat, nombre.trim(), items, semestre, tipo);
    };

    const validationHint = !nombre.trim() ? "Ingresa un nombre para la evaluación."
        : temas.length === 0 ? "Agrega al menos un contenido con sus indicadores."
        : temasIncompletos ? "Completa todos los contenidos: cada uno debe tener nombre e indicadores con valor."
        : targetIds.length === 0 ? "Selecciona a quién aplicar la evaluación."
        : "";

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="addeval-form" className={styles.saveBtn} disabled={!valid} title={validationHint || undefined}>Añadir evaluación</button>
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

                        {/* Tipo + Semestre */}
                        <div className={styles.row2}>
                            <FormField label="Tipo de evaluación">
                                <div className={styles.tipoToggle}>
                                    {(["numerica", "analitica"] as EvalTipo[]).map(t => (
                                        <button key={t} type="button"
                                            className={`${styles.tipoBtn}${tipo === t ? ` ${styles.tipoBtnActive}` : ""}`}
                                            onClick={() => setTipo(t)}>
                                            {t === "numerica" ? "Numérica" : "Analítica"}
                                        </button>
                                    ))}
                                </div>
                                <span className={styles.tipoHint}>
                                    {tipo === "numerica"
                                        ? `${rangoNumerica.min}–${rangoNumerica.max} pts`
                                        : `${rangoAnalitica.min}–${rangoAnalitica.max} pts`}
                                </span>
                            </FormField>
                            <FormField label="Semestre">
                                <select className={styles.formInput} value={semestre} onChange={e => setSemestre(e.target.value as 's1' | 's2')}>
                                    <option value="s1">Semestre I</option>
                                    <option value="s2">Semestre II</option>
                                </select>
                            </FormField>
                        </div>

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
                                                {!isOpen ? (
                                                    <span className={styles.temaBuilderCollapsedName}>
                                                        {tema.nombre || <em style={{ color: "var(--tx-3)" }}>Sin nombre</em>}
                                                        {temaPts > 0 && <span className={styles.temaBuilderCollapsedPts}> — {temaPts} pts</span>}
                                                    </span>
                                                ) : (
                                                    <input
                                                        className={styles.temaBuilderInput}
                                                        placeholder="Nombre del contenido"
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
                                                                placeholder="Indicador a evaluar"
                                                                value={p.nombre}
                                                                onChange={(e) => updatePunto(tema.id, p.id, { nombre: e.target.value })}
                                                            />
                                                            <input
                                                                className={styles.puntoBuilderVal}
                                                                type="number"
                                                                placeholder={String((tipo === "numerica" ? rangoNumerica : rangoAnalitica).max)}
                                                                min={(tipo === "numerica" ? rangoNumerica : rangoAnalitica).min}
                                                                max={(tipo === "numerica" ? rangoNumerica : rangoAnalitica).max}
                                                                step={1}
                                                                value={p.valor || ""}
                                                                onChange={(e) => updatePunto(tema.id, p.id, { valor: e.target.value === "" ? 0 : Number(e.target.value) })}
                                                            />
                                                            <span className={styles.puntoBuilderPts}>pts</span>
                                                            <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                                                                onClick={() => removePunto(tema.id, p.id)}><TrashIcon /></button>
                                                        </div>
                                                    ))}
                                                    <div className={styles.puntoBuilderFooter}>
                                                        <button type="button" className={styles.builderAddPuntoBtn}
                                                            onClick={() => addPunto(tema.id)}>
                                                            <PlusIcon /> Agregar indicador
                                                        </button>
                                                        <button type="button" className={styles.builderSaveBtn}
                                                            disabled={!temaOk}
                                                            onClick={() => setExpandedId("")}>
                                                            Guardar contenido
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
                                    {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.grupo}-{a.seccion} ({a.año})</option>)}
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
                                        {estAsigs.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.grupo}-{a.seccion} ({a.año})</option>)}
                                    </select>
                                </FormField>
                            </div>
                        )}
                        {targetIds.length > 0 && (
                            <div className={styles.targetInfo}>
                                Se añadirá a <strong>{targetIds.length}</strong> registro{targetIds.length !== 1 ? "s" : ""}
                            </div>
                        )}
                        {validationHint && (
                            <div className={styles.validationHint}>{validationHint}</div>
                        )}
            </form>
        </Modal>
    );
}

// ─── TemaGroupRow — collapsible contenido with puntos ────────────────────────
function TemaGroupRow({ temaName, items, tipo, onAddPunto, onEditPunto, onDeleteItem, onNotaBlur, onNotaDescBlur }: {
    temaName: string;
    items: TemaItem[];
    tipo: EvalTipo;
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
                    <PlusIcon /> Agregar indicador
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
                                        step={1}
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
    const [puntoModal, setPuntoModal] = useState<{ temaName?: string; item?: TemaItem; tipo?: EvalTipo } | null>(null);

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
                    {temasMap.size === 0 && <p className={styles.emptyItems}>Sin contenidos — añade el primer indicador</p>}

                    {[...temasMap.entries()].map(([temaName, items]) => (
                        <TemaGroupRow
                            key={temaName}
                            temaName={temaName}
                            items={items}
                            tipo={entry.tipo}
                            onAddPunto={() => setPuntoModal({ temaName, tipo: entry.tipo })}
                            onEditPunto={(item) => setPuntoModal({ temaName, item, tipo: entry.tipo })}
                            onDeleteItem={handleDeleteItem}
                            onNotaBlur={handleNotaBlur}
                            onNotaDescBlur={handleNotaDescBlur}
                        />
                    ))}

                    <div className={styles.entryFooter}>
                        <button type="button" className={styles.addItemBtn} onClick={() => setPuntoModal({ tipo: entry.tipo })}>
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
                    tipo={puntoModal.tipo}
                    onSave={handleSavePunto}
                    onClose={() => setPuntoModal(null)}
                />
            )}
        </div>
    );
}

// ─── CategoryGroup ────────────────────────────────────────────────────────────
function CategoryGroup({ label, catKey, entries, weight, maxEntries, onChange }: {
    label: string; catKey: EvalCategory; entries: EvalEntry[]; weight: number;
    maxEntries?: number;
    onChange: (entries: EvalEntry[]) => void;
}) {
    const pct     = catPct(entries);
    const hasData = entries.some((e) => e.items.some((i) => i.nota > 0));
    const pc      = pctClass(pct, hasData, styles as unknown as CSSMod);
    const atLimit = maxEntries !== undefined && entries.length >= maxEntries;

    const handleUpdate = (updated: EvalEntry) => onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
    const handleDelete = (id: string) => onChange(entries.filter((e) => e.id !== id));

    return (
        <div className={styles.catGroup}>
            <div className={styles.catGroupHead}>
                <span className={styles.catTitle}>{label}</span>
                <div className={styles.catStats}>
                    {hasData && <span className={`${styles.catPct} ${pc}`}>{pct}%</span>}
                    <span className={styles.catWeight}>{weight}%</span>
                    {maxEntries !== undefined && (
                        <span className={atLimit ? styles.catLimitReached : styles.catAllocNote}>
                            {entries.length}/{maxEntries}
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
                <div className={styles.catEmpty}>Sin evaluaciones · {weight}% disponibles</div>
            )}
        </div>
    );
}

// ─── StudentPanel ─────────────────────────────────────────────────────────────
function StudentPanel({ record, conductaPct, nivelConfig, onUpdate, onDelete, onConductaChange }: {
    record: StudentEval; conductaPct: number; nivelConfig: NivelConfig;
    onUpdate: (id: string, patch: Partial<StudentEval>) => void;
    onDelete: (id: string) => void;
    onConductaChange: (estudianteId: string, pct: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const score   = calcScore(record, conductaPct, nivelConfig);
    const scoreS1 = calcScorePeriod(record, conductaPct, nivelConfig, 's1');
    const scoreS2 = calcScorePeriod(record, conductaPct, nivelConfig, 's2');
    const sc = (s: number) => styles[ACADEMIC_CLASS[getAcademicStatus(s)] as keyof typeof styles];

    return (
        <div className={styles.asigPanel}>
            <div className={styles.asigPanelHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.asigPanelName}>{record.nombre}</span>
                <span className={styles.periodBadges}>
                    <span className={`${styles.periodBadge} ${sc(scoreS1)}`}>Semestre I: {scoreS1}%</span>
                    <span className={`${styles.periodBadge} ${sc(scoreS2)}`}>Semestre II: {scoreS2}%</span>
                </span>
                <span className={`${styles.asigScore} ${sc(score)}`} title="Promedio general">P. General: {score}%</span>
                <StatusBadge score={score} />
                <ConductaChip pct={conductaPct} onChange={(pct) => onConductaChange(record.estudianteId ?? record.id, pct)} />
                <Link to={`/app/asistencia?asig=${record.asignaturaId}`}
                    className={`${styles.asistChip} ${sc(asistPct(record.asistencia))}`}
                    onClick={(e) => e.stopPropagation()}>
                    {asistPct(record.asistencia)}% asistencia →
                </Link>
                <div className={styles.rowActions}>
                    <Link to={`/app/estudiantes?q=${encodeURIComponent(record.nombre)}`}
                        className={styles.iconBtn}
                        onClick={(e) => e.stopPropagation()}
                        title="Ver en Estudiantes"><UsersIcon /></Link>
                    <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                        onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}><TrashIcon /></button>
                </div>
            </div>
            {open && (
                <div className={styles.asigBody}>
                    {ALL_CATS
                        .filter((c) => c.key !== "proyecto" || nivelConfig.numProyectos > 0)
                        .map((c) => {
                            const maxMap: Record<EvalCategory, number | undefined> = {
                                cotidiano: undefined,
                                tareas:    nivelConfig.numTareas,
                                prueba:    nivelConfig.numPruebas,
                                proyecto:  nivelConfig.numProyectos,
                            };
                            return (
                                <CategoryGroup
                                    key={c.key}
                                    label={c.label}
                                    catKey={c.key}
                                    entries={record[c.key]}
                                    weight={nivelConfig[c.key]}
                                    maxEntries={maxMap[c.key]}
                                    onChange={(entries) => onUpdate(record.id, { [c.key]: entries })}
                                />
                            );
                        })}
                </div>
            )}
        </div>
    );
}

// ─── AsignaturaGroup ──────────────────────────────────────────────────────────
function AsignaturaGroup({ asigNombre, records, conductaMap, nivelConfig, onUpdate, onDelete, onConductaChange }: {
    asigNombre: string;
    records: StudentEval[];
    conductaMap: Map<string, number>;
    nivelConfig: NivelConfig;
    onUpdate: (id: string, patch: Partial<StudentEval>) => void;
    onDelete: (id: string) => void;
    onConductaChange: (estudianteId: string, pct: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const scores       = records.map((r) => calcScore(r, conductaMap.get(r.estudianteId ?? r.id) ?? 100, nivelConfig));
    const eximidos     = scores.filter((s) => getAcademicStatus(s) === "eximido").length;
    const aprobados    = scores.filter((s) => getAcademicStatus(s) === "aprobado").length;
    const convocatoria = scores.filter((s) => getAcademicStatus(s) === "convocatoria").length;
    const reprobados   = scores.filter((s) => getAcademicStatus(s) === "reprobado").length;

    return (
        <div className={styles.studentCard}>
            <div className={styles.studentCardHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.studentName}>{asigNombre}</span>
                <span className={styles.asigLabel}>{records.length} estudiante{records.length !== 1 ? "s" : ""}</span>
                <span className={styles.statusBreakdown}>
                    {eximidos     > 0 && <span className={styles.statusExcelente}>{eximidos} eximido{eximidos !== 1 ? "s" : ""}</span>}
                    {aprobados    > 0 && <span className={styles.statusMuyBuena}>{aprobados} aprobado{aprobados !== 1 ? "s" : ""}</span>}
                    {convocatoria > 0 && <span className={styles.statusRegular}>{convocatoria} convocatoria</span>}
                    {reprobados   > 0 && <span className={styles.statusDeficiente}>{reprobados} reprobado{reprobados !== 1 ? "s" : ""}</span>}
                </span>
            </div>
            {open && (
                <div className={styles.cardBody}>
                    {records.map((record) => (
                        <StudentPanel
                            key={record.id}
                            record={record}
                            conductaPct={conductaMap.get(record.estudianteId ?? record.id) ?? 100}
                            nivelConfig={nivelConfig}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onConductaChange={onConductaChange}
                        />
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
    const storeUpdate   = useEvaluacionesStore((s) => s.updateRecord);
    const nivelConfigs  = useConfiguracionStore((s) => s.nivelConfigs);
    const storeDelete   = useEvaluacionesStore((s) => s.deleteRecord);

    const storeConducta = useEvaluacionesStore((s) => s.updateConducta);
    const storeAddEval  = useEvaluacionesStore((s) => s.addEvalEntry);

    const [search,      setSearch]      = useState("");
    const [filterAño,    setFilterAño]    = useState("");
    const [filterGrupo,  setFilterGrupo]  = useState("");
    const [filterAsig,   setFilterAsig]   = useState("");
    const [filterEstado, setFilterEstado] = useState<AcademicStatus | "">("");

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

    const asigNombreMap = useMemo(() => {
        const m: Record<string, string> = {};
        asignaturas.forEach((a) => { m[a.id] = `${a.nombre} ${a.grupo} - ${a.seccion}`; });
        return m;
    }, [asignaturas]);

    const asigNivelMap = useMemo(() => {
        const m = new Map<string, NivelConfig>();
        asignaturas.forEach((a) => {
            const key = `${a.año}-${a.grupo}`;
            m.set(a.id, nivelConfigs[key] ?? DEFAULT_NIVEL_CONFIG);
        });
        return m;
    }, [asignaturas, nivelConfigs]);

    const asignaturaGroups = useMemo(() => {
        const map = new Map<string, { key: string; nombre: string; records: StudentEval[] }>();
        filtered.forEach((r) => {
            if (!map.has(r.asignaturaId)) {
                map.set(r.asignaturaId, { key: r.asignaturaId, nombre: asigNombreMap[r.asignaturaId] ?? r.asignaturaId, records: [] });
            }
            map.get(r.asignaturaId)!.records.push(r);
        });
        const q = search.toLowerCase().trim();
        return [...map.values()].filter((g) => !q || g.nombre.toLowerCase().includes(q));
    }, [filtered, search, asigNombreMap]);

    const activeFilterCount = [filterAño, filterGrupo, filterAsig, filterEstado].filter(Boolean).length;

    const avgScore = (g: { key: string; records: StudentEval[] }) => {
        if (!g.records.length) return 100;
        const cfg = asigNivelMap.get(g.key) ?? DEFAULT_NIVEL_CONFIG;
        return g.records.reduce((s, r) => {
            const cp = conductaMap.get(r.estudianteId ?? r.id) ?? 100;
            return s + calcScore(r, cp, cfg);
        }, 0) / g.records.length;
    };

    const filteredGroups = useMemo(() => {
        if (!filterEstado) return asignaturaGroups;
        return asignaturaGroups.filter((g) => getAcademicStatus(Math.round(avgScore(g))) === filterEstado);
    }, [asignaturaGroups, filterEstado, conductaMap, asigNivelMap]);

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
    }, [filteredGroups, sortBy, conductaMap, asigNivelMap]);

    const totalAsignaturas = useMemo(
        () => new Set(records.map((r) => r.asignaturaId)).size, [records]
    );

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>Evaluaciones</h2>
                    <p className={styles.countText}>
                        {sortedGroups.length !== totalAsignaturas
                            ? `${sortedGroups.length} de ${totalAsignaturas} asignatura${totalAsignaturas !== 1 ? "s" : ""}`
                            : `${totalAsignaturas} asignatura${totalAsignaturas !== 1 ? "s" : ""}`}
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
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar asignatura…" width={220} />
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
                                        onChange={(e) => setFilterEstado(e.target.value as AcademicStatus | "")}>
                                        <option value="">Todos</option>
                                        <option value="eximido">Eximido</option>
                                        <option value="aprobado">Aprobado</option>
                                        <option value="convocatoria">Convocatoria</option>
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
                                {SORT_OPTIONS.map((o) => {
                                    const active = sortBy === o.value;
                                    return (
                                        <button key={o.value} type="button"
                                            className={`${styles.sortOption}${active ? ` ${styles.sortOptionActive}` : ""}`}
                                            onClick={() => { setSortBy(o.value); setShowSort(false); }}>
                                            {o.label}
                                            {active
                                                ? <CheckIcon className={styles.sortCheckIcon} />
                                                : <span style={{ width: 13 }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className={styles.body}>
                {asignaturaGroups.length === 0 ? (
                    <EmptyState
                        title={records.length === 0 ? "Sin asignaturas registradas" : "Sin resultados"}
                        subtitle={records.length === 0 ? "Agrega estudiantes y asignaturas primero" : "Intenta con otros filtros"}
                    />
                ) : (
                    sortedGroups.map((group) => (
                        <AsignaturaGroup
                            key={group.key}
                            asigNombre={group.nombre}
                            records={group.records}
                            conductaMap={conductaMap}
                            nivelConfig={asigNivelMap.get(group.key) ?? DEFAULT_NIVEL_CONFIG}
                            onUpdate={storeUpdate}
                            onDelete={storeDelete}
                            onConductaChange={storeConducta}
                        />
                    ))
                )}
            </div>


            {showAddEval && (
                <AddEvalModal
                    records={records}
                    asignaturas={asignaturas}
                    onSave={(ids, cat, nombre, items, semestre, tipo) => { storeAddEval(ids, cat, nombre, items, semestre, tipo); setShowAddEval(false); }}
                    onClose={() => setShowAddEval(false)}
                />
            )}
        </div>
    );
}
