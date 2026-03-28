import { useState, useEffect, useMemo, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEvaluacionesStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { DEFAULT_EVAL_SCALES, DEFAULT_NIVEL_CONFIG } from "../../settings/constants";
import { useConfiguracionStore } from "../../settings/store";
import type { EvalScale } from "../../settings/types";
import { getAttendanceStats } from "../../attendance/utils/attendance.utils";
import type { TemaItem, EvalEntry, EvalCategory, EvalTipo, StudentEval, NivelConfig } from "../types";
import { PlusIcon, TrashIcon, EditIcon, ChevronDownIcon, FilterIcon, SortIcon, CheckIcon, UsersIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "./EvaluationsPage.module.css";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ALL_CATS: { key: EvalCategory; label: string }[] = [
    { key: "cotidiano", label: "Trabajo Cotidiano" },
    { key: "tareas",    label: "Tareas" },
    { key: "prueba",    label: "Prueba" },
    { key: "proyecto",  label: "Proyecto" },
];

let _seq = 100;
const uid = () => (++_seq).toString();

// â”€â”€â”€ Score helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getEntryItemMax(entry: EvalEntry): number {
    return entry.items.reduce((sum, item) => sum + item.valor, 0);
}

function getEntryItemEarned(entry: EvalEntry): number {
    return entry.items.reduce((sum, item) => sum + Math.min(item.nota, item.valor), 0);
}

function entryEarned(entry: EvalEntry): number {
    const itemMax = getEntryItemMax(entry);
    if (itemMax <= 0) return 0;
    const itemEarned = getEntryItemEarned(entry);
    return Math.min(entry.pct, (itemEarned / itemMax) * entry.pct);
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
    return getAttendanceStats(
        allW.flatMap((week) => week.dias),
        useConfiguracionStore.getState().unjustifiedAbsencesPerFault,
        useConfiguracionStore.getState().tardiesPerFault,
    ).pct;
}
function applyAusenciasRebaja(total: number, record: StudentEval): number {
    const { umbralAusencias } = useConfiguracionStore.getState();
    const absencePct = 100 - asistPct(record.asistencia);
    const penalty = umbralAusencias.filter(u =>
        u.dir === ">" ? absencePct >= u.valor : absencePct <= u.valor
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

// â”€â”€ Academic status (for badge + group breakdown + filter) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

function pctClass(_pct: number, hasData: boolean, _s: CSSMod) {
    if (!hasData) return "";
    return "";
}
type CSSMod = typeof import("./EvaluationsPage.module.css");

function getScaleByType(evalScales: EvalScale[], evalType?: EvalTipo): EvalScale {
    const scales = evalScales.length > 0 ? evalScales : DEFAULT_EVAL_SCALES;
    return scales.find((scale) => scale.id === evalType)
        ?? scales.find((scale) => scale.id === "numerica")
        ?? scales[0];
}


// â”€â”€â”€ Conducta Chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ PuntoModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function IndicatorModal({ initial, contentName, evalType, onSave, onClose }: {
    initial: Partial<TemaItem>; contentName?: string;
    evalType?: EvalTipo;
    onSave: (item: TemaItem) => void; onClose: () => void;
}) {
    const evalScales = useConfiguracionStore(s => s.evalScales);
    const scoreRange = getScaleByType(evalScales, evalType);

    const [content, setContent] = useState(initial.tema ?? contentName ?? "");
    const [name, setName] = useState(initial.nombre ?? "");
    const [description, setDescription] = useState(initial.descripcion ?? "");
    const [value, setValue] = useState(initial.valor ?? scoreRange.max);
    const isEdit = Boolean(initial.id);
    const isValid = content.trim() !== "" && name.trim() !== "" && value > 0;

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="indicator-form" className={styles.saveBtn} disabled={!isValid}>{isEdit ? "Guardar" : "Confirmar"}</button>
        </>
    );

    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar indicador" : "Nuevo indicador de evaluación"} footer={footer}>
            <form
                id="indicator-form"
                style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!isValid) return;
                    onSave({
                        id: initial.id ?? uid(),
                        tema: content.trim(),
                        nombre: name.trim(),
                        descripcion: description.trim(),
                        valor: value,
                        nota: initial.nota ?? value,
                        notaDescripcion: initial.notaDescripcion ?? "",
                    });
                }}>
                {!contentName && (
                    <FormField label="Contenido" required>
                        <input
                            className={styles.formInput}
                            type="text"
                            placeholder="Ej: Ecosistemas"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            autoFocus
                            required
                        />
                    </FormField>
                )}
                <div className={styles.row2}>
                    <FormField label="Nombre del indicador" required>
                        <input
                            className={styles.formInput}
                            type="text"
                            placeholder="Ej: Definición"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus={Boolean(contentName)}
                            required
                        />
                    </FormField>
                    <FormField label="Valor máximo (pts)" required>
                        <input
                            className={styles.formInput}
                            type="number"
                            min={scoreRange.min}
                            max={scoreRange.max}
                            step={1}
                            value={value}
                            onChange={(e) => setValue(Math.min(scoreRange.max, Math.max(scoreRange.min, Number(e.target.value))))}
                            required
                        />
                    </FormField>
                </div>
                <FormField label="Descripción">
                    <input className={styles.formInput} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
                </FormField>
            </form>
        </Modal>
    );
}

function AddEvalModal({ records, asignaturas: assignments, onSave, onClose }: {
    records: StudentEval[];
    asignaturas: { id: string; nombre: string; grupo: number; seccion: number; year: number }[];
    onSave: (recordIds: string[], category: EvalCategory, name: string, items: TemaItem[], semester: 's1' | 's2', evalType: EvalTipo) => void;
    onClose: () => void;
}) {
    type LocalIndicator = { id: string; nombre: string; valor: number };
    type LocalContent = { id: string; nombre: string; puntos: LocalIndicator[] };

    const evalScales = useConfiguracionStore(s => s.evalScales);
    const availableEvalScales = evalScales.length > 0 ? evalScales : DEFAULT_EVAL_SCALES;

    const [category, setCategory] = useState<EvalCategory>("prueba");
    const [evalType, setEvalType] = useState<EvalTipo>(availableEvalScales[0]?.id ?? "numerica");
    const [semester, setSemester] = useState<'s1' | 's2'>('s1');
    const [evalName, setEvalName] = useState("");
    const [contents, setContents] = useState<LocalContent[]>([]);
    const [expandedId, setExpandedId] = useState<string>("");
    const [target, setTarget] = useState<"estudiante" | "asignatura">("asignatura");
    const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
    const [studentAssignmentId, setStudentAssignmentId] = useState("");
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

    useEffect(() => {
        if (!availableEvalScales.some((scale) => scale.id === evalType)) {
            setEvalType(availableEvalScales[0]?.id ?? "numerica");
        }
    }, [availableEvalScales, evalType]);

    const students = useMemo(() => {
        const studentMap = new Map<string, { id: string; nombre: string }>();
        records.forEach((record) => {
            if (record.estudianteId && !studentMap.has(record.estudianteId)) {
                studentMap.set(record.estudianteId, { id: record.estudianteId, nombre: record.nombre });
            }
        });
        return [...studentMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [records]);

    const availableAssignments = useMemo(
        () => assignments.filter((assignment) => records.some((record) => record.asignaturaId === assignment.id)),
        [assignments, records]
    );

    const targetIds = useMemo((): string[] => {
        if (target === "asignatura" && selectedAssignmentIds.length > 0) {
            const assignmentIdSet = new Set(selectedAssignmentIds);
            return records.filter((record) => assignmentIdSet.has(record.asignaturaId)).map((record) => record.id);
        }
        if (target === "estudiante" && selectedStudentIds.length > 0) {
            const studentIdSet = new Set(selectedStudentIds);
            return records
                .filter((record) => Boolean(record.estudianteId) && studentIdSet.has(record.estudianteId as string))
                .filter((record) => record.asignaturaId === studentAssignmentId)
                .map((record) => record.id);
        }
        return [];
    }, [target, selectedAssignmentIds, selectedStudentIds, studentAssignmentId, records]);

    const availableStudents = useMemo(
        () => studentAssignmentId
            ? students.filter((student) => records.some((record) => record.estudianteId === student.id && record.asignaturaId === studentAssignmentId))
            : [],
        [studentAssignmentId, students, records]
    );

    const toggleSelection = (current: string[], value: string) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

    const addContent = () => {
        const newId = uid();
        setContents((current) => [...current, { id: newId, nombre: "", puntos: [] }]);
        setExpandedId(newId);
    };

    const removeContent = (contentId: string) => {
        setContents((current) => current.filter((item) => item.id !== contentId));
        setExpandedId((current) => current === contentId ? "" : current);
    };

    const setContentName = (contentId: string, value: string) =>
        setContents((current) => current.map((item) => item.id === contentId ? { ...item, nombre: value } : item));

    const addIndicator = (contentId: string) => {
        const scoreRange = getScaleByType(availableEvalScales, evalType);
        setContents((current) => current.map((item) => item.id === contentId
            ? { ...item, puntos: [...item.puntos, { id: uid(), nombre: "", valor: scoreRange.max }] }
            : item));
    };

    const removeIndicator = (contentId: string, indicatorId: string) =>
        setContents((current) => current.map((item) => item.id === contentId
            ? { ...item, puntos: item.puntos.filter((indicator) => indicator.id !== indicatorId) }
            : item));

    const updateIndicator = (contentId: string, indicatorId: string, patch: Partial<LocalIndicator>) =>
        setContents((current) => current.map((item) => item.id === contentId
            ? { ...item, puntos: item.puntos.map((indicator) => indicator.id === indicatorId ? { ...indicator, ...patch } : indicator) }
            : item));

    const totalPts = contents.flatMap((content) => content.puntos).reduce((sum, indicator) => sum + indicator.valor, 0);

    const hasIncompleteContent = contents.length > 0 && !contents.every((content) =>
        content.nombre.trim() !== "" &&
        content.puntos.length > 0 &&
        content.puntos.every((indicator) => indicator.nombre.trim() !== "" && indicator.valor > 0)
    );

    const isValid =
        evalName.trim() !== "" &&
        totalPts > 0 &&
        targetIds.length > 0 &&
        contents.length > 0 &&
        !hasIncompleteContent;

    const handleSave = (e: FormEvent) => {
        e.preventDefault();
        if (!isValid) return;
        const items: TemaItem[] = contents.flatMap((content) =>
            content.puntos.map((indicator) => ({
                id: uid(),
                tema: content.nombre.trim(),
                nombre: indicator.nombre.trim(),
                descripcion: "",
                valor: indicator.valor,
                nota: indicator.valor,
                notaDescripcion: "",
            }))
        );
        onSave(targetIds, category, evalName.trim(), items, semester, evalType);
    };

    const validationHint = !evalName.trim() ? "Escribe el nombre de la evaluación."
        : contents.length === 0 ? "Agrega al menos un contenido."
        : hasIncompleteContent ? "Completa los contenidos e indicadores."
        : targetIds.length === 0 ? "Selecciona a quién aplicar la evaluación."
        : "";
    const selectedScale = getScaleByType(availableEvalScales, evalType);

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="addeval-form" className={styles.modalConfirmBtn} disabled={!isValid} title={validationHint || undefined}>Confirmar</button>
        </>
    );

    return (
        <Modal open onClose={onClose} title="Añadir evaluación" footer={footer}>
            <form id="addeval-form" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div className={styles.row2}>
                    <FormField label="Categoría">
                        <select className={styles.formInput} value={category} onChange={(e) => setCategory(e.target.value as EvalCategory)}>
                            {ALL_CATS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                    </FormField>
                    <FormField label="Nombre" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Prueba 1" value={evalName} onChange={(e) => setEvalName(e.target.value)} required />
                    </FormField>
                </div>

                <div className={styles.row2}>
                    <FormField
                        label={(
                            <span className={styles.inlineFieldLabel}>
                                <span>Tipo de evaluación</span>
                                <span className={styles.tipoHintInline}>{selectedScale.min}-{selectedScale.max} pts</span>
                            </span>
                        )}>
                        <select className={styles.formInput} value={evalType} onChange={(e) => setEvalType(e.target.value)}>
                            {availableEvalScales.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
                        </select>
                    </FormField>
                    <FormField label="Semestre">
                        <select className={styles.formInput} value={semester} onChange={(e) => setSemester(e.target.value as 's1' | 's2')}>
                            <option value="s1">Semestre I</option>
                            <option value="s2">Semestre II</option>
                        </select>
                    </FormField>
                </div>

                    <FormField label="Contenido">
                    <div className={styles.temaBuilderIntro}>
                        Cada contenido puede agrupar varios indicadores de evaluación.
                    </div>
                    <div className={styles.temaBuilderList}>
                        {contents.map((content, index) => {
                            const isOpen = expandedId === content.id;
                            const indicatorCount = content.puntos.length;
                            const contentPts = content.puntos.reduce((sum, indicator) => sum + indicator.valor, 0);
                            return (
                                <div key={content.id} className={styles.temaBuilder}>
                                    <div
                                        className={`${styles.temaBuilderHead} ${isOpen ? styles.temaBuilderHeadOpen : ""} ${!isOpen ? styles.temaBuilderHeadCollapsed : ""}`}
                                        onClick={() => setExpandedId(isOpen ? "" : content.id)}
                                        style={{ cursor: "pointer" }}>
                                        <div className={styles.temaBuilderHeadTop}>
                                            <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                                            <div className={styles.temaBuilderHeadText}>
                                                <div className={styles.temaBuilderLabelRow}>
                                                    <span className={styles.temaBuilderBadge}>Contenido {index + 1}</span>
                                                    <span className={styles.temaBuilderMeta}>
                                                        {indicatorCount} indicador{indicatorCount !== 1 ? "es" : ""}
                                                        {contentPts > 0 ? ` · ${contentPts} pts` : ""}
                                                    </span>
                                                </div>
                                                {!isOpen && (
                                                    <span className={styles.temaBuilderCollapsedName}>
                                                        {content.nombre || <em style={{ color: "var(--tx-3)" }}>Sin nombre</em>}
                                                    </span>
                                                )}
                                            </div>
                                            {contents.length > 1 && (
                                                <button
                                                    type="button"
                                                    className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                                                    onClick={(e) => { e.stopPropagation(); removeContent(content.id); }}><TrashIcon /></button>
                                            )}
                                        </div>
                                        {isOpen && (
                                            <div className={styles.temaBuilderInputRow}>
                                                <input
                                                    className={styles.temaBuilderInput}
                                                    placeholder="Nombre del contenido"
                                                    value={content.nombre}
                                                    onChange={(e) => { e.stopPropagation(); setContentName(content.id, e.target.value); }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    autoFocus
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {isOpen && (
                                        <div className={styles.puntoBuilderRows}>
                                            <div className={styles.puntoBuilderSectionHead}>
                                                <span className={styles.puntoBuilderSectionTitle}>Indicadores</span>
                                                <span className={styles.puntoBuilderSectionHint}>
                                                    Define los criterios que vas a calificar dentro de este contenido.
                                                </span>
                                            </div>
                                            {content.puntos.length === 0 && (
                                                <div className={styles.puntoBuilderEmpty}>
                                                    Este contenido aun no tiene indicadores.
                                                </div>
                                            )}
                                            {content.puntos.map((indicator) => (
                                                <div key={indicator.id} className={styles.puntoBuilderRow}>
                                                    <input
                                                        className={styles.puntoBuilderName}
                                                        placeholder="Indicador a evaluar"
                                                        value={indicator.nombre}
                                                        onChange={(e) => updateIndicator(content.id, indicator.id, { nombre: e.target.value })}
                                                    />
                                                    <input
                                                        className={styles.puntoBuilderVal}
                                                        type="number"
                                                        placeholder={String(getScaleByType(availableEvalScales, evalType).max)}
                                                        min={getScaleByType(availableEvalScales, evalType).min}
                                                        max={getScaleByType(availableEvalScales, evalType).max}
                                                        step={1}
                                                        value={indicator.valor || ""}
                                                        onChange={(e) => updateIndicator(content.id, indicator.id, { valor: e.target.value === "" ? 0 : Number(e.target.value) })}
                                                    />
                                                    <span className={styles.puntoBuilderPts}>pts</span>
                                                    <button
                                                        type="button"
                                                        className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                                                        onClick={() => removeIndicator(content.id, indicator.id)}><TrashIcon /></button>
                                                </div>
                                            ))}
                                            <div className={styles.puntoBuilderFooter}>
                                                <button type="button" className={`${styles.builderAddTemaBtn} ${styles.builderAddPuntoBtn}`} onClick={() => addIndicator(content.id)}>
                                                    <PlusIcon /> Agregar indicador
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button type="button" className={styles.builderAddTemaBtn} onClick={addContent}>
                            <PlusIcon /> Agregar contenido
                        </button>
                    </div>
                    {totalPts > 0 && (
                        <div className={styles.builderTotal}>
                            Total: <strong>{totalPts} pts</strong>
                        </div>
                    )}
                </FormField>

                <FormField label="Aplicar a">
                    <select
                        className={styles.formInput}
                        value={target}
                        onChange={(e) => {
                            const nextTarget = e.target.value as "estudiante" | "asignatura";
                            setTarget(nextTarget);
                            setSelectedAssignmentIds([]);
                            setSelectedStudentIds([]);
                            setStudentAssignmentId("");
                        }}>
                        {availableAssignments.length > 0 && <option value="asignatura">Asignatura</option>}
                        {students.length > 0 && <option value="estudiante">Estudiante</option>}
                    </select>
                </FormField>
                {target === "asignatura" && (
                    <FormField label="Asignatura" required>
                        <div className={styles.multiSelectList}>
                            {availableAssignments.map((assignment) => (
                                <label key={assignment.id} className={styles.multiSelectOption}>
                                    <input
                                        type="checkbox"
                                        checked={selectedAssignmentIds.includes(assignment.id)}
                                        onChange={() => setSelectedAssignmentIds((current) => toggleSelection(current, assignment.id))}
                                    />
                                    <span>{assignment.nombre} {assignment.grupo}-{assignment.seccion} ({assignment.year})</span>
                                </label>
                            ))}
                        </div>
                    </FormField>
                )}
                {target === "estudiante" && (
                    <div className={styles.row2}>
                        <FormField label="Asignatura" required>
                            <select
                                className={styles.formInput}
                                value={studentAssignmentId}
                                onChange={(e) => {
                                    setStudentAssignmentId(e.target.value);
                                    setSelectedStudentIds([]);
                                }}
                                required>
                                <option value="">Selecciona...</option>
                                {availableAssignments.map((assignment) => (
                                    <option key={assignment.id} value={assignment.id}>
                                        {assignment.nombre} {assignment.grupo}-{assignment.seccion} ({assignment.year})
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="Estudiante" required>
                            <div className={styles.multiSelectList}>
                                {availableStudents.map((student) => (
                                    <label key={student.id} className={styles.multiSelectOption}>
                                        <input
                                            type="checkbox"
                                            checked={selectedStudentIds.includes(student.id)}
                                            onChange={() => setSelectedStudentIds((current) => toggleSelection(current, student.id))}
                                        />
                                        <span>{student.nombre}</span>
                                    </label>
                                ))}
                            </div>
                        </FormField>
                    </div>
                )}
                {targetIds.length > 0 && (
                    <div className={styles.targetInfo}>
                        Se añadirá a <strong>{targetIds.length}</strong> registro{targetIds.length !== 1 ? "s" : ""}
                    </div>
                )}
                {validationHint && <div className={styles.validationHint}>{validationHint}</div>}
            </form>
        </Modal>
    );
}
function TemaGroupRow({ temaName, items, tipo: _tipo, onAddPunto, onEditPunto, onDeleteItem, onNotaBlur, onNotaDescBlur }: {
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

    return (
        <div className={styles.temaGroup}>
            <div className={styles.temaGroupHead} onClick={() => setOpen(v => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.temaGroupName}>{temaName}</span>
                <span className={styles.temaGroupScore}>
                    {tHas && <span className={styles.temaGroupPct}>{tPct}%</span>}
                    {tHas && <span className={styles.temaGroupDivider}>·</span>}
                    <span>{notaT}/{maxT} pts</span>
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

// â”€â”€â”€ EvalEntryRow â€” temas with multiple puntos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EvalEntryRow({ entry, onUpdate, onDelete }: {
    entry: EvalEntry;
    onUpdate: (updated: EvalEntry) => void;
    onDelete: (id: string) => void;
}) {
    const [open,       setOpen]       = useState(false);
    const [indicatorModal, setIndicatorModal] = useState<{ contentName?: string; item?: TemaItem; evalType?: EvalTipo } | null>(null);

    const itemMax   = getEntryItemMax(entry);
    const itemEarned = getEntryItemEarned(entry);
    const pct       = toPct(itemEarned, itemMax);
    const hasItems  = itemMax > 0;

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
        setIndicatorModal(null);
    };
    const handleDeleteItem = (id: string) => onUpdate({ ...entry, items: entry.items.filter((i) => i.id !== id) });

    // Inline nota change â€” save on blur
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

    return (
        <div className={styles.entryRow}>
            <div className={styles.entryHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.entryName}>{entry.nombre}</span>
                {hasItems && <span className={styles.entryAlloc}>{itemEarned}/{itemMax} pts</span>}
                {hasItems && <span className={styles.entryPct}>{pct}%</span>}
                <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>
                    <TrashIcon />
                </button>
            </div>

            {open && (
                <div className={styles.entryBody}>
                    {temasMap.size === 0 && <p className={styles.emptyItems}>Sin contenidos, añade el primer indicador.</p>}

                    {[...temasMap.entries()].map(([temaName, items]) => (
                        <TemaGroupRow
                            key={temaName}
                            temaName={temaName}
                            items={items}
                            tipo={entry.tipo}
                            onAddPunto={() => setIndicatorModal({ contentName: temaName, evalType: entry.tipo })}
                            onEditPunto={(item) => setIndicatorModal({ contentName: temaName, item, evalType: entry.tipo })}
                            onDeleteItem={handleDeleteItem}
                            onNotaBlur={handleNotaBlur}
                            onNotaDescBlur={handleNotaDescBlur}
                        />
                    ))}

                    <div className={styles.entryFooter}>
                        <button type="button" className={styles.addItemBtn} onClick={() => setIndicatorModal({ evalType: entry.tipo })}>
                            <PlusIcon /> Agregar contenido
                        </button>
                    </div>
                </div>
            )}

            {indicatorModal !== null && (
                <IndicatorModal
                    initial={indicatorModal.item ?? {}}
                    contentName={indicatorModal.contentName}
                    evalType={indicatorModal.evalType}
                    onSave={handleSavePunto}
                    onClose={() => setIndicatorModal(null)}
                />
            )}
        </div>
    );
}

// â”€â”€â”€ CategoryGroup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CategoryGroup({ label, catKey: _catKey, entries, weight, maxEntries, onChange }: {
    label: string; catKey: EvalCategory; entries: EvalEntry[]; weight: number;
    maxEntries?: number;
    onChange: (entries: EvalEntry[]) => void;
}) {
    const pct     = catPct(entries);
    const hasData = entries.some((e) => e.items.some((i) => i.nota > 0));
    const pc      = pctClass(pct, hasData, styles as unknown as CSSMod);
    const atLimit = maxEntries !== undefined && entries.length >= maxEntries;
    const assignedPoints = entries.reduce((sum, entry) => sum + entry.pct, 0);
    const entryProgress = maxEntries !== undefined ? `${entries.length}/${maxEntries}` : `${entries.length}`;

    const handleUpdate = (updated: EvalEntry) => onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
    const handleDelete = (id: string) => onChange(entries.filter((e) => e.id !== id));

    return (
        <div className={styles.catGroup}>
            <div className={styles.catGroupHead}>
                <span className={styles.catTitle}>
                    {label}
                    {maxEntries !== undefined && (
                        <span className={atLimit ? `${styles.catTitleMeta} ${styles.catTitleMetaAlert}` : styles.catTitleMeta}>
                            ({entryProgress})
                        </span>
                    )}
                </span>
                <div className={styles.catStats}>
                    {hasData && <span className={`${styles.catPct} ${pc}`}>{pct}%</span>}
                    {hasData && <span className={styles.catDivider}>·</span>}
                    <span className={styles.catPoints}>{assignedPoints} / {weight} pts</span>
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

// â”€â”€â”€ StudentPanel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                    {asistPct(record.asistencia)}% asistencia
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

// â”€â”€â”€ AsignaturaGroup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ EvaluationsPage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function EvaluationsPage() {
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const records       = useEvaluacionesStore((s) => s.records);
    const cotidianos    = useEvaluacionesStore((s) => s.cotidianos);
    const storeUpdate   = useEvaluacionesStore((s) => s.updateRecord);
    const nivelConfigs  = useConfiguracionStore((s) => s.nivelConfigs);
    const storeDelete   = useEvaluacionesStore((s) => s.deleteRecord);

    const storeConducta = useEvaluacionesStore((s) => s.updateConducta);
    const storeAddEval  = useEvaluacionesStore((s) => s.addEvalEntry);

    const [search,      setSearch]      = useState("");
    const [filterYear,    setFilterYear]    = useState("");
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

    const years = useMemo(() => [...new Set(asignaturas.map((a) => a.year))].sort((a, b) => b - a), [asignaturas]);
    const grupos = useMemo(() => {
        const base = filterYear ? asignaturas.filter((a) => a.year === Number(filterYear)) : asignaturas;
        return [...new Set(base.map((a) => a.grupo))].sort();
    }, [asignaturas, filterYear]);
    const filteredAsigs = useMemo(() =>
        asignaturas
            .filter((a) => (!filterYear   || a.year   === Number(filterYear)))
            .filter((a) => (!filterGrupo || a.grupo  === Number(filterGrupo))),
        [asignaturas, filterYear, filterGrupo]
    );

    const filtered = useMemo(() =>
        records.filter((r) => {
            if (filterAsig && r.asignaturaId !== filterAsig) return false;
            if (filterYear || filterGrupo) {
                const a = asignaturas.find((a) => a.id === r.asignaturaId);
                if (!a) return false;
                if (filterYear   && a.year   !== Number(filterYear)) return false;
                if (filterGrupo && a.grupo  !== Number(filterGrupo)) return false;
            }
            return true;
        }),
        [records, filterAsig, filterYear, filterGrupo, asignaturas]
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
            const key = `${a.year}-${a.grupo}`;
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

    const activeFilterCount = [filterYear, filterGrupo, filterAsig, filterEstado].filter(Boolean).length;

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
                    <button type="button" className={styles.addEvalBtn} onClick={() => setShowAddEval(true)}>
                        <PlusIcon /> Nueva evaluación
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar asignatura..." width={220} />
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
                                    <label>Year</label>
                                    <select value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setFilterGrupo(""); setFilterAsig(""); }}>
                                        <option value="">Todos</option>
                                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
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
                                        {filteredAsigs.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.grupo} · {a.year}</option>)}
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
                                        onClick={() => { setFilterYear(""); setFilterGrupo(""); setFilterAsig(""); setFilterEstado(""); }}>
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




