import { useState, useEffect, useMemo, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEvaluacionesStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { DEFAULT_EVAL_SCALES, DEFAULT_NIVEL_CONFIG } from "../../settings/constants";
import { useConfiguracionStore } from "../../settings/store";
import { getNivelConfigForAsignatura } from "../../settings/utils/nivel-config.utils";
import type { EvalScale } from "../../settings/types";
import { getAttendanceStats } from "../../attendance/utils/attendance.utils";
import type { TemaItem, EvalEntry, EvalCategory, EvalTipo, StudentEval, NivelConfig } from "../types";
import { PlusIcon, TrashIcon, EditIcon, ChevronDownIcon, FilterIcon, SortIcon, CheckIcon, UsersIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "./EvaluationsPage.module.css";

// Constants
const ALL_CATS: { key: EvalCategory; label: string }[] = [
    { key: "cotidiano", label: "Trabajo Cotidiano" },
    { key: "tareas",    label: "Tareas" },
    { key: "prueba",    label: "Prueba" },
    { key: "proyecto",  label: "Proyecto" },
];

let _seq = 100;
const uid = () => (++_seq).toString();

// Score helpers
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

function getDisplayEntryMax(entry: EvalEntry, category: EvalCategory): number {
    return category === "prueba" ? entry.pct : getEntryItemMax(entry);
}

function getDisplayEntryEarned(entry: EvalEntry, category: EvalCategory): number {
    if (category === "prueba") return Math.round(entryEarned(entry));
    return getEntryItemEarned(entry);
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

// Academic status (for badge + group breakdown + filter)
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

function getCategoryWeight(config: NivelConfig, category: EvalCategory): number {
    if (category === "proyecto" && config.numProyectos === 0) return 0;
    return config[category];
}

function getDefaultContentName(index: number): string {
    return `Contenido ${index + 1}`;
}

function getDefaultIndicatorName(index: number): string {
    return `Indicador ${index + 1}`;
}

function getRemainingCategoryPoints(record: StudentEval, category: EvalCategory, config: NivelConfig): number {
    const assigned = record[category].reduce((sum, entry) => sum + entry.pct, 0);
    return Math.max(0, getCategoryWeight(config, category) - assigned);
}


// Conducta chip
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

// PuntoModal
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
        <Modal open onClose={onClose} title={isEdit ? "Editar indicador" : "Nuevo indicador de evaluaci\u00f3n"} footer={footer}>
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
                            placeholder="Ej: Definici\u00f3n"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus={Boolean(contentName)}
                            required
                        />
                    </FormField>
                    <FormField label="Valor m\u00e1ximo (pts)" required>
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
                <FormField label="Descripci\u00f3n">
                    <input className={styles.formInput} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
                </FormField>
            </form>
        </Modal>
    );
}

function ChecklistDropdown({
    placeholder,
    summary,
    options,
}: {
    placeholder: string;
    summary?: string;
    options: { id: string; label: string; checked: boolean; disabled?: boolean; onToggle: () => void }[];
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    return (
        <div
            ref={rootRef}
            className={styles.dropdownField}
            onBlur={(event) => {
                const nextFocused = event.relatedTarget as Node | null;
                if (!nextFocused || !rootRef.current?.contains(nextFocused)) {
                    setOpen(false);
                }
            }}>
            <button
                type="button"
                className={`${styles.formControl} ${styles.dropdownTrigger} ${open ? styles.dropdownTriggerOpen : ""}`}
                onClick={() => setOpen((current) => !current)}>
                <span className={summary && summary.trim() !== "" ? styles.dropdownValue : styles.dropdownPlaceholder}>
                    {summary && summary.trim() !== "" ? summary : placeholder}
                </span>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
            </button>
            {open && (
                <div
                    className={styles.dropdownMenu}
                    onMouseDown={(event) => {
                        event.preventDefault();
                    }}>
                    <div className={styles.dropdownOptions}>
                        {options.map((option) => (
                            <label
                                key={option.id}
                                className={`${styles.multiSelectOption} ${option.disabled ? styles.multiSelectOptionDisabled : ""}`}
                                onClick={(event) => {
                                    if (option.disabled) {
                                        event.preventDefault();
                                        return;
                                    }
                                    if (event.target instanceof HTMLInputElement) return;
                                    event.preventDefault();
                                    option.onToggle();
                                }}>
                                <input
                                    type="checkbox"
                                    checked={option.checked}
                                    disabled={option.disabled}
                                    tabIndex={open ? 0 : -1}
                                    onChange={option.onToggle}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function AddEvalModal({ records, asignaturas: assignments, nivelConfigs, onSave, onClose }: {
    records: StudentEval[];
    asignaturas: { id: string; nombre: string; grupo: number; seccion: number; year: number }[];
    nivelConfigs: Record<string, NivelConfig>;
    onSave: (recordIds: string[], category: EvalCategory, name: string, pct: number, items: TemaItem[], semester: 's1' | 's2', evalType: EvalTipo) => void;
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
    const [assignedPoints, setAssignedPoints] = useState(0);

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

    const assignmentMap = useMemo(
        () => new Map(availableAssignments.map((assignment) => [assignment.id, assignment])),
        [availableAssignments]
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

    const targetRecords = useMemo(() => {
        if (targetIds.length === 0) return [] as StudentEval[];
        const idSet = new Set(targetIds);
        return records.filter((record) => idSet.has(record.id));
    }, [records, targetIds]);

    const maxAssignablePoints = useMemo(() => {
        if (targetRecords.length === 0) return 0;
        return targetRecords.reduce((minRemaining, record) => {
            const assignment = assignmentMap.get(record.asignaturaId);
            const config = getNivelConfigForAsignatura(nivelConfigs, assignment);
            const remaining = getRemainingCategoryPoints(record, category, config);
            return Math.min(minRemaining, remaining);
        }, Number.POSITIVE_INFINITY);
    }, [assignmentMap, category, nivelConfigs, targetRecords]);

    const remainingCategorySlots = useMemo(() => {
        if (targetRecords.length === 0) return undefined;

        const getCategoryLimit = (config: NivelConfig) => {
            switch (category) {
                case "tareas":
                    return config.numTareas;
                case "prueba":
                    return config.numPruebas;
                case "proyecto":
                    return config.numProyectos;
                default:
                    return undefined;
            }
        };

        return targetRecords.reduce<number | undefined>((minRemaining, record) => {
            const assignment = assignmentMap.get(record.asignaturaId);
            const config = getNivelConfigForAsignatura(nivelConfigs, assignment);
            const limit = getCategoryLimit(config);
            if (limit === undefined) return minRemaining;
            const used = record[category].length;
            const remaining = Math.max(0, limit - used);
            if (minRemaining === undefined) return remaining;
            return Math.min(minRemaining, remaining);
        }, undefined);
    }, [assignmentMap, category, nivelConfigs, targetRecords]);

    useEffect(() => {
        setAssignedPoints((current) => {
            if (!Number.isFinite(maxAssignablePoints) || maxAssignablePoints <= 0) return 0;
            if (current <= 0 || current > maxAssignablePoints) return maxAssignablePoints;
            return current;
        });
    }, [maxAssignablePoints, category]);

    const toggleSelection = (current: string[], value: string) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

    const selectedAssignmentGroup = useMemo(() => {
        const firstSelectedId = selectedAssignmentIds[0];
        if (!firstSelectedId) return undefined;
        return availableAssignments.find((assignment) => assignment.id === firstSelectedId)?.grupo;
    }, [availableAssignments, selectedAssignmentIds]);

    const selectedAssignmentSummary = useMemo(() => {
        if (selectedAssignmentIds.length === 0) return "";
        return selectedAssignmentIds
            .map((id) => availableAssignments.find((assignment) => assignment.id === id))
            .filter(Boolean)
            .map((assignment) => `${assignment!.nombre} ${assignment!.grupo}-${assignment!.seccion} (${assignment!.year})`)
            .join(", ");
    }, [availableAssignments, selectedAssignmentIds]);

    const selectedStudentSummary = useMemo(() => {
        if (selectedStudentIds.length === 0) return "";
        return selectedStudentIds
            .map((id) => availableStudents.find((student) => student.id === id))
            .filter(Boolean)
            .map((student) => student!.nombre)
            .join(", ");
    }, [availableStudents, selectedStudentIds]);

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
        const remainingPoints = Math.max(0, maxAssignablePoints - totalPts);
        const nextValue = Math.min(scoreRange.max, remainingPoints);
        if (nextValue <= 0) return;
        setContents((current) => current.map((item) => item.id === contentId
            ? { ...item, puntos: [...item.puntos, { id: uid(), nombre: "", valor: nextValue }] }
            : item));
    };

    const removeIndicator = (contentId: string, indicatorId: string) =>
        setContents((current) => current.map((item) => item.id === contentId
            ? { ...item, puntos: item.puntos.filter((indicator) => indicator.id !== indicatorId) }
            : item));

    const totalPts = contents.flatMap((content) => content.puntos).reduce((sum, indicator) => sum + indicator.valor, 0);
    const remainingIndicatorPoints = Math.max(0, maxAssignablePoints - totalPts);

    const updateIndicator = (contentId: string, indicatorId: string, patch: Partial<LocalIndicator>) =>
        setContents((current) => current.map((item) => {
            if (item.id !== contentId) return item;
            return {
                ...item,
                puntos: item.puntos.map((indicator) => {
                    if (indicator.id !== indicatorId) return indicator;
                    if (patch.valor === undefined) return { ...indicator, ...patch };

                    const scoreRange = getScaleByType(availableEvalScales, evalType);
                    const otherPoints = current
                        .flatMap((content) => content.puntos)
                        .filter((entry) => entry.id !== indicatorId)
                        .reduce((sum, entry) => sum + entry.valor, 0);
                    const maxForIndicator = Math.max(0, maxAssignablePoints - otherPoints);
                    const nextValue = Math.min(
                        scoreRange.max,
                        maxForIndicator,
                        Math.max(scoreRange.min, Number(patch.valor) || 0)
                    );
                    return { ...indicator, ...patch, valor: nextValue };
                }),
            };
        }));

    const hasIncompleteContent = contents.length > 0 && !contents.every((content) =>
        content.puntos.length > 0 &&
        content.puntos.every((indicator) => indicator.valor > 0)
    );

    const isPruebaCategory = category === "prueba";
    const effectiveAssignedPoints = isPruebaCategory ? assignedPoints : totalPts;
    const mustUseFullRemainingPoints = remainingCategorySlots === 1;
    const hasAssignmentContext = target === "asignatura" ? selectedAssignmentIds.length > 0 : studentAssignmentId !== "";
    const activitiesIndicator = remainingCategorySlots === undefined
        ? "Sin l\u00edmite configurado."
        : remainingCategorySlots > 0
            ? `${remainingCategorySlots} disponible${remainingCategorySlots !== 1 ? "s" : ""}.`
            : "Sin cupos.";
    const isValid =
        evalName.trim() !== "" &&
        targetIds.length > 0 &&
        effectiveAssignedPoints > 0 &&
        effectiveAssignedPoints <= maxAssignablePoints &&
        (!mustUseFullRemainingPoints || effectiveAssignedPoints === maxAssignablePoints) &&
        (isPruebaCategory || contents.length > 0) &&
        (isPruebaCategory || !hasIncompleteContent);

    const handleSave = (e: FormEvent) => {
        e.preventDefault();
        if (!isValid) return;

        const items: TemaItem[] = isPruebaCategory
            ? [{
                id: uid(),
                tema: "Resultado",
                nombre: evalName.trim(),
                descripcion: "",
                valor: assignedPoints,
                nota: assignedPoints,
                notaDescripcion: "",
            }]
            : contents.flatMap((content, contentIndex) => {
                const contentName = content.nombre.trim() || getDefaultContentName(contentIndex);
                return content.puntos.map((indicator, indicatorIndex) => ({
                    id: uid(),
                    tema: contentName,
                    nombre: indicator.nombre.trim() || getDefaultIndicatorName(indicatorIndex),
                    descripcion: "",
                    valor: indicator.valor,
                    nota: indicator.valor,
                    notaDescripcion: "",
                }));
            });

        onSave(targetIds, category, evalName.trim(), effectiveAssignedPoints, items, semester, evalType);
    };

    const validationHint = !evalName.trim() ? "Escribe el nombre de la evaluacion."
        : targetIds.length === 0 ? "Selecciona a quien aplicar la evaluacion."
        : remainingCategorySlots !== undefined && remainingCategorySlots <= 0 ? "Ya no quedan actividades disponibles en esta categoria. Ve a Configuracion para personalizar el limite."
        : maxAssignablePoints <= 0 ? "Ya no quedan puntos disponibles en esta categoria."
        : effectiveAssignedPoints <= 0 ? (isPruebaCategory ? "Indica cuanto vale la prueba." : "La suma de indicadores debe ser mayor que cero.")
        : effectiveAssignedPoints > maxAssignablePoints ? `Solo quedan ${maxAssignablePoints} pts disponibles.`
        : mustUseFullRemainingPoints && effectiveAssignedPoints !== maxAssignablePoints ? `Esta categoria solo permite una evaluacion restante, debe valer ${maxAssignablePoints} pts.`
        : !isPruebaCategory && contents.length === 0 ? "Agrega al menos un contenido."
        : !isPruebaCategory && hasIncompleteContent ? "Completa los contenidos e indicadores."
        : "";
    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="addeval-form" className={styles.modalConfirmBtn} disabled={!isValid} title={validationHint || undefined}>Confirmar</button>
        </>
    );

    return (
        <Modal open onClose={onClose} title={"A\u00f1adir evaluaci\u00f3n"} footer={footer} className={styles.addEvalModal}>
            <form id="addeval-form" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div className={styles.row2}>
                    <FormField label="Nombre" required>
                        <input className={`${styles.formControl} ${styles.formInput}`} type="text" placeholder="Ej: Prueba 1" value={evalName} onChange={(e) => setEvalName(e.target.value)} required />
                    </FormField>
                    <FormField label={"Categor\u00eda"}>
                        <div className={styles.categoryField}>
                            <select className={`${styles.formControl} ${styles.formInput}`} value={category} onChange={(e) => setCategory(e.target.value as EvalCategory)}>
                                {ALL_CATS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </select>
                            <div className={`${styles.categoryIndicator} ${remainingCategorySlots !== undefined && remainingCategorySlots <= 0 ? styles.categoryIndicatorAlert : ""}`}>
                                {activitiesIndicator}
                            </div>
                        </div>
                    </FormField>
                </div>

                {isPruebaCategory ? (
                    <div className={styles.row3WithFull}>
                        {target === "asignatura" && (
                            <div className={styles.fullRow}>
                                <FormField label="Niveles" required>
                                    <ChecklistDropdown
                                        placeholder="Selecciona asignaturas"
                                        summary={selectedAssignmentSummary}
                                        options={availableAssignments.map((assignment) => ({
                                            id: assignment.id,
                                            label: `${assignment.nombre} ${assignment.grupo}-${assignment.seccion} (${assignment.year})`,
                                            checked: selectedAssignmentIds.includes(assignment.id),
                                            disabled: !selectedAssignmentIds.includes(assignment.id) && selectedAssignmentGroup !== undefined && assignment.grupo !== selectedAssignmentGroup,
                                            onToggle: () => setSelectedAssignmentIds((current) => {
                                                const currentGroup = current.length > 0
                                                    ? availableAssignments.find((item) => item.id === current[0])?.grupo
                                                    : undefined;
                                                if (!current.includes(assignment.id) && currentGroup !== undefined && assignment.grupo !== currentGroup) {
                                                    return current;
                                                }
                                                return toggleSelection(current, assignment.id);
                                            }),
                                        }))}
                                    />
                                </FormField>
                            </div>
                        )}
                        <FormField label="Aplicar a">
                            <select
                                className={`${styles.formControl} ${styles.formInput}`}
                                value={target}
                                onChange={(e) => {
                                    const nextTarget = e.target.value as "estudiante" | "asignatura";
                                    setTarget(nextTarget);
                                    setSelectedAssignmentIds([]);
                                    setSelectedStudentIds([]);
                                    setStudentAssignmentId("");
                                }}>
                                {availableAssignments.length > 0 && <option value="asignatura">Niveles</option>}
                                {students.length > 0 && <option value="estudiante">Estudiante</option>}
                            </select>
                        </FormField>
                        <FormField
                            label={"Valor de la Prueba"}
                            required>
                            <input
                                className={`${styles.formControl} ${styles.formInput}`}
                                type="number"
                                min={0}
                                max={Math.max(0, maxAssignablePoints)}
                                step={1}
                                value={assignedPoints || ""}
                                disabled={!hasAssignmentContext}
                                onChange={(e) => setAssignedPoints(e.target.value === "" ? 0 : Math.max(0, Math.min(maxAssignablePoints, Number(e.target.value))))}
                                required
                            />
                        </FormField>
                        <FormField label="Semestre">
                            <select className={`${styles.formControl} ${styles.formInput}`} value={semester} onChange={(e) => setSemester(e.target.value as 's1' | 's2')}>
                                <option value="s1">Semestre I</option>
                                <option value="s2">Semestre II</option>
                            </select>
                        </FormField>
                    </div>
                ) : (
                    <div className={styles.row3WithFull}>
                        {target === "asignatura" && (
                            <div className={styles.fullRow}>
                                <FormField label="Niveles" required>
                                    <ChecklistDropdown
                                        placeholder="Selecciona asignaturas"
                                        summary={selectedAssignmentSummary}
                                        options={availableAssignments.map((assignment) => ({
                                            id: assignment.id,
                                            label: `${assignment.nombre} ${assignment.grupo}-${assignment.seccion} (${assignment.year})`,
                                            checked: selectedAssignmentIds.includes(assignment.id),
                                            disabled: !selectedAssignmentIds.includes(assignment.id) && selectedAssignmentGroup !== undefined && assignment.grupo !== selectedAssignmentGroup,
                                            onToggle: () => setSelectedAssignmentIds((current) => {
                                                const currentGroup = current.length > 0
                                                    ? availableAssignments.find((item) => item.id === current[0])?.grupo
                                                    : undefined;
                                                if (!current.includes(assignment.id) && currentGroup !== undefined && assignment.grupo !== currentGroup) {
                                                    return current;
                                                }
                                                return toggleSelection(current, assignment.id);
                                            }),
                                        }))}
                                    />
                                </FormField>
                            </div>
                        )}
                        <FormField label="Aplicar a">
                            <select
                                className={`${styles.formControl} ${styles.formInput}`}
                                value={target}
                                onChange={(e) => {
                                    const nextTarget = e.target.value as "estudiante" | "asignatura";
                                    setTarget(nextTarget);
                                    setSelectedAssignmentIds([]);
                                    setSelectedStudentIds([]);
                                    setStudentAssignmentId("");
                                }}>
                                {availableAssignments.length > 0 && <option value="asignatura">Niveles</option>}
                                {students.length > 0 && <option value="estudiante">Estudiante</option>}
                            </select>
                        </FormField>
                        <FormField label={"Tipo de evaluaci\u00f3n"}>
                            <select className={`${styles.formControl} ${styles.formInput}`} value={evalType} onChange={(e) => setEvalType(e.target.value)}>
                                {availableEvalScales.map((scale) => (
                                    <option key={scale.id} value={scale.id}>
                                        {scale.label} ({scale.min}-{scale.max} pts)
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="Semestre">
                            <select className={`${styles.formControl} ${styles.formInput}`} value={semester} onChange={(e) => setSemester(e.target.value as 's1' | 's2')}>
                                <option value="s1">Semestre I</option>
                                <option value="s2">Semestre II</option>
                            </select>
                        </FormField>
                    </div>
                )}
                {target === "estudiante" && (
                    <div className={styles.row2}>
                        <FormField label="Asignatura" required>
                            <select
                                className={`${styles.formControl} ${styles.formInput}`}
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
                            {availableStudents.length === 0 ? (
                                <div className={`${styles.formControl} ${styles.multiSelectList} ${styles.multiSelectListEmpty}`}>
                                    <span className={styles.multiSelectEmptyText}>
                                        {studentAssignmentId ? "No hay estudiantes disponibles." : "Selecciona una asignatura."}
                                    </span>
                                </div>
                            ) : (
                                <ChecklistDropdown
                                    placeholder="Selecciona estudiantes"
                                    summary={selectedStudentSummary}
                                    options={availableStudents.map((student) => ({
                                        id: student.id,
                                        label: student.nombre,
                                        checked: selectedStudentIds.includes(student.id),
                                        onToggle: () => setSelectedStudentIds((current) => toggleSelection(current, student.id)),
                                    }))}
                                />
                            )}
                        </FormField>
                    </div>
                )}

                {!isPruebaCategory && (
                    <FormField label="Contenido">
                    <div className={styles.temaBuilderIntro}>
                        {"Cada contenido puede agrupar varios indicadores de evaluaci\u00f3n."}
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
                                                    <span className={styles.temaBuilderBadge}>Contenido</span>
                                                    <span className={styles.temaBuilderMeta}>
                                                        {indicatorCount} indicador{indicatorCount !== 1 ? "es" : ""}
                                                        {contentPts > 0 ? ` \u00b7 ${contentPts} pts` : ""}
                                                    </span>
                                                </div>
                                                {!isOpen && (
                                                    <span className={styles.temaBuilderCollapsedName}>
                                                        {content.nombre.trim() || <em style={{ color: "var(--tx-3)" }}>{getDefaultContentName(index)}</em>}
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
                                                    placeholder={getDefaultContentName(index)}
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
                                            {content.puntos.map((indicator, indicatorIndex) => (
                                                <div key={indicator.id} className={styles.puntoBuilderRow}>
                                                    <input
                                                        className={styles.puntoBuilderName}
                                                        placeholder={getDefaultIndicatorName(indicatorIndex)}
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
                                                <button
                                                    type="button"
                                                    className={`${styles.builderAddTemaBtn} ${styles.builderAddPuntoBtn}`}
                                                    onClick={() => addIndicator(content.id)}
                                                    disabled={remainingIndicatorPoints <= 0}>
                                                    <PlusIcon /> Agregar indicador
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            className={styles.builderAddTemaBtn}
                            onClick={addContent}
                            disabled={remainingIndicatorPoints <= 0}>
                            <PlusIcon /> Agregar contenido
                        </button>
                    </div>
                    {totalPts > 0 && (
                        <div className={`${styles.builderTotal} ${totalPts > maxAssignablePoints ? styles.sumWarn : ""}`}>
                            {"Valor de la evaluaci\u00f3n: "}<strong>{totalPts} pts</strong>
                            {" \u00b7 "}
                            <span>{maxAssignablePoints} pts m\u00e1ximo</span>
                        </div>
                    )}
                </FormField>
                )}
                {targetIds.length > 0 && (
                    <div className={styles.targetInfo}>
                        {"Se a\u00f1adir\u00e1 a "}<strong>{targetIds.length}</strong> registro{targetIds.length !== 1 ? "s" : ""}
                    </div>
                )}
                {validationHint && <div className={styles.validationHint}>{validationHint}</div>}
            </form>
        </Modal>
    );
}
function TemaGroupRow({ temaName, items, tipo: _tipo, allowStructureEdit = true, onEditPunto, onDeleteItem, onNotaChange }: {
    temaName: string;
    items: TemaItem[];
    tipo: EvalTipo;
    allowStructureEdit?: boolean;
    onEditPunto: (item: TemaItem) => void;
    onDeleteItem: (id: string) => void;
    onNotaChange: (id: string, raw: string) => void;
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
                    {tHas && <span className={styles.temaGroupDivider}>{"\u00b7"}</span>}
                    <span>{notaT}/{maxT} pts</span>
                </span>
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
                                <div className={styles.notaCell}>
                                    <input
                                        type="number"
                                        className={styles.notaInput}
                                        value={item.nota}
                                        min={0}
                                        max={item.valor}
                                        step={1}
                                        onChange={(e) => onNotaChange(item.id, e.target.value)}
                                    />
                                    <span className={styles.notaMax}>/{item.valor}</span>
                                </div>
                            </div>
                            {allowStructureEdit && (
                                <div className={styles.puntoActions}>
                                    <button type="button" className={styles.iconBtn} onClick={() => onEditPunto(item)}><EditIcon /></button>
                                    <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`} onClick={() => onDeleteItem(item.id)}><TrashIcon /></button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// EvalEntryRow
function EvalEntryRow({ entry, category, onUpdate, onDelete }: {
    entry: EvalEntry;
    category: EvalCategory;
    onUpdate: (updated: EvalEntry) => void;
    onDelete: (id: string) => void;
}) {
    const [open,       setOpen]       = useState(false);
    const [indicatorModal, setIndicatorModal] = useState<{ contentName?: string; item?: TemaItem; evalType?: EvalTipo } | null>(null);
    const allowStructureEdit = category !== "prueba";

    const itemMax   = getEntryItemMax(entry);
    const displayMax = getDisplayEntryMax(entry, category);
    const displayEarned = getDisplayEntryEarned(entry, category);
    const pct       = toPct(displayEarned, displayMax);
    const hasItems  = displayMax > 0;

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

    const handleNotaChange = (itemId: string, raw: string) => {
        const item = entry.items.find((i) => i.id === itemId);
        if (!item) return;
        const nota = Math.min(item.valor, Math.max(0, Number(raw) || 0));
        if (nota !== item.nota) onUpdate({ ...entry, items: entry.items.map((i) => i.id === itemId ? { ...i, nota } : i) });
    };
    return (
        <div className={styles.entryRow}>
            <div className={styles.entryHead} onClick={() => setOpen((v) => !v)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <span className={styles.entryName}>{entry.nombre}</span>
                {hasItems && <span className={styles.entryAlloc}>{displayEarned}/{displayMax} pts</span>}
                {hasItems && <span className={styles.entryPct}>{pct}%</span>}
                <button type="button" className={`${styles.iconBtn} ${styles.deleteBtnIcon}`}
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>
                    <TrashIcon />
                </button>
            </div>

            {open && (
                <div className={styles.entryBody}>
                    {category === "prueba" ? (
                        <div className={styles.temaItems}>
                            {entry.items.map((item) => (
                                <div key={item.id} className={styles.puntoRow}>
                                    <div className={styles.puntoInfo}>
                                        <span className={styles.puntoNombre}>{entry.nombre}</span>
                                    </div>
                                    <div className={styles.puntoGrade}>
                                        <div className={styles.notaCell}>
                                            <input
                                                type="number"
                                                className={styles.notaInput}
                                                value={Math.round(entryEarned(entry))}
                                                min={0}
                                                max={entry.pct}
                                                step={1}
                                                onChange={(e) => {
                                                    const nextEarned = Math.max(0, Math.min(entry.pct, Number(e.target.value) || 0));
                                                    const nextNota = entry.pct > 0 && itemMax > 0
                                                        ? Math.min(item.valor, Math.max(0, (nextEarned / entry.pct) * item.valor))
                                                        : 0;
                                                    if (nextNota !== item.nota) {
                                                        onUpdate({
                                                            ...entry,
                                                            items: entry.items.map((current) =>
                                                                current.id === item.id ? { ...current, nota: nextNota } : current
                                                            ),
                                                        });
                                                    }
                                                }}
                                            />
                                            <span className={styles.notaMax}>/{entry.pct}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            {temasMap.size === 0 && <p className={styles.emptyItems}>{"Sin contenidos."}</p>}

                            {[...temasMap.entries()].map(([temaName, items]) => (
                                <TemaGroupRow
                                    key={temaName}
                                    temaName={temaName}
                                    items={items}
                                    tipo={entry.tipo}
                                    allowStructureEdit={allowStructureEdit}
                                    onEditPunto={(item) => setIndicatorModal({ contentName: temaName, item, evalType: entry.tipo })}
                                    onDeleteItem={handleDeleteItem}
                                    onNotaChange={handleNotaChange}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}

            {allowStructureEdit && indicatorModal !== null && (
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

// CategoryGroup
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
                    {hasData && <span className={styles.catDivider}>{"\u00b7"}</span>}
                    <span className={styles.catPoints}>{assignedPoints} / {weight} pts</span>
                </div>
            </div>

            {entries.length > 0 && (
                <div className={styles.catEntries}>
                    {entries.map((entry) => (
                        <EvalEntryRow key={entry.id} entry={entry} category={_catKey} onUpdate={handleUpdate} onDelete={handleDelete} />
                    ))}
                </div>
            )}
            {entries.length === 0 && (
                <div className={styles.catEmpty}>{"Sin evaluaciones \u00b7 "}{weight}% disponibles</div>
            )}
        </div>
    );
}

function SemesterGroup({ label, period, score, scoreClassName, record, nivelConfig, onUpdate }: {
    label: string;
    period: "s1" | "s2";
    score: number;
    scoreClassName: string;
    record: StudentEval;
    nivelConfig: NivelConfig;
    onUpdate: (id: string, patch: Partial<StudentEval>) => void;
}) {
    const [open, setOpen] = useState(true);

    return (
        <div className={styles.semesterGroup}>
            <button type="button" className={styles.semesterGroupHead} onClick={() => setOpen((current) => !current)}>
                <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}><ChevronDownIcon /></span>
                <div className={styles.semesterGroupTitleWrap}>
                    <span className={styles.semesterGroupEyebrow}>Semestre</span>
                    <span className={styles.semesterGroupTitle}>{label}</span>
                </div>
                <span className={`${styles.periodBadge} ${scoreClassName}`}>{score}%</span>
            </button>
            {open && (
                <div className={styles.semesterGroupBody}>
                    {ALL_CATS
                        .filter((c) => c.key !== "proyecto" || nivelConfig.numProyectos > 0)
                        .map((c) => {
                            const maxMap: Record<EvalCategory, number | undefined> = {
                                cotidiano: undefined,
                                tareas:    nivelConfig.numTareas,
                                prueba:    nivelConfig.numPruebas,
                                proyecto:  nivelConfig.numProyectos,
                            };
                            const semesterEntries = record[c.key].filter((entry) => entry.semestre === period);
                            return (
                                <CategoryGroup
                                    key={`${period}-${c.key}`}
                                    label={c.label}
                                    catKey={c.key}
                                    entries={semesterEntries}
                                    weight={nivelConfig[c.key]}
                                    maxEntries={maxMap[c.key]}
                                    onChange={(nextSemesterEntries) => {
                                        const otherEntries = record[c.key].filter((entry) => entry.semestre !== period);
                                        onUpdate(record.id, { [c.key]: [...otherEntries, ...nextSemesterEntries] });
                                    }}
                                />
                            );
                        })}
                </div>
            )}
        </div>
    );
}

// StudentPanel
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
                <div className={styles.headerBadgeGroup}>
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
                </div>
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
                    <SemesterGroup
                        label="Semestre I"
                        period="s1"
                        score={scoreS1}
                        scoreClassName={sc(scoreS1)}
                        record={record}
                        nivelConfig={nivelConfig}
                        onUpdate={onUpdate}
                    />
                    <SemesterGroup
                        label="Semestre II"
                        period="s2"
                        score={scoreS2}
                        scoreClassName={sc(scoreS2)}
                        record={record}
                        nivelConfig={nivelConfig}
                        onUpdate={onUpdate}
                    />
                </div>
            )}
        </div>
    );
}

// AsignaturaGroup
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

// EvaluationsPage
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
        { value: "nombre-asc",  label: "Nombre A-Z" },
        { value: "nombre-desc", label: "Nombre Z-A" },
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
            m.set(a.id, getNivelConfigForAsignatura(nivelConfigs, a));
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
                        <PlusIcon /> {"Nueva evaluaci\u00f3n"}
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
                                        {filteredAsigs.map((a) => <option key={a.id} value={a.id}>{a.nombre}{" \u00b7 "}{a.grupo}{" \u00b7 "}{a.year}</option>)}
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
                    nivelConfigs={nivelConfigs}
                    onSave={(ids, cat, nombre, pct, items, semestre, tipo) => { storeAddEval(ids, cat, nombre, pct, items, semestre, tipo); setShowAddEval(false); }}
                    onClose={() => setShowAddEval(false)}
                />
            )}
        </div>
    );
}





