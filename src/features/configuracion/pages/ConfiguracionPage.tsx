import { useState, useEffect } from "react";
import { useEvaluacionesStore } from "../../evaluaciones/store";
import { useAsistenciaStore } from "../../asistencia/store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import { useConfiguracionStore } from "../store";
import type { EvalWeights } from "../../evaluaciones/types";
import type { GlobalSemConfig } from "../../asistencia/types";
import type { NotifPriority } from "../../notifications/store";
import styles from "../ConfiguracionPage.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type DateParts = { month: string; day: string };
const MONTH_NAMES = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
function parseDateParts(d: string): DateParts {
    if (!d) return { month: "", day: "" };
    const p = d.split("-");
    return { month: String(parseInt(p[1] ?? "0", 10) || ""), day: String(parseInt(p[2] ?? "0", 10) || "") };
}
function buildFullDate(year: number, parts: DateParts): string {
    if (!parts.month || !parts.day) return "";
    return `${year}-${parts.month.padStart(2,"0")}-${parts.day.padStart(2,"0")}`;
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function ConfigSection({ title, description, defaultOpen = false, children }: {
    title: string; description: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={styles.section}>
            <button type="button" className={styles.sectionHead} onClick={() => setOpen(v => !v)}>
                <div className={styles.sectionHeadText}>
                    <span className={styles.sectionTitle}>{title}</span>
                    <span className={styles.sectionDesc}>{description}</span>
                </div>
                <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
            {open && <div className={styles.sectionBody}>{children}</div>}
        </div>
    );
}

// ─── Row: label left, control right ──────────────────────────────────────────
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
                <span>{label}</span>
                {hint && <span className={styles.settingHint}>{hint}</span>}
            </div>
            <div className={styles.settingControl}>{children}</div>
        </div>
    );
}

// ─── Saved indicator ─────────────────────────────────────────────────────────
function SavedBadge({ saved }: { saved: boolean }) {
    if (!saved) return null;
    return <span className={styles.savedBadge}>Guardado</span>;
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className={styles.toggle}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className={styles.toggleTrack}>
                <span className={styles.toggleThumb} />
            </span>
        </label>
    );
}

// ─── Distribución evaluativa ──────────────────────────────────────────────────
function WeightsSection() {
    const storeWeights = useEvaluacionesStore(s => s.weights);
    const setWeights   = useEvaluacionesStore(s => s.setWeights);
    const [w, setW]    = useState<EvalWeights>({ ...storeWeights });
    const [saved, setSaved] = useState(false);

    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const valid = total === 100;

    const ROWS: { key: keyof EvalWeights; label: string; hint: string }[] = [
        { key: "conducta",  label: "Conducta",          hint: "Comportamiento general del estudiante" },
        { key: "cotidiano", label: "Trabajo Cotidiano",  hint: "Participación y trabajo en clase" },
        { key: "tareas",    label: "Tareas",             hint: "Asignaciones fuera del aula" },
        { key: "prueba",    label: "Prueba",             hint: "Evaluaciones escritas" },
        { key: "proyecto",  label: "Proyecto",           hint: "Trabajos de investigación o proyectos" },
        { key: "asistencia",label: "Asistencia",         hint: "Presencia en clase" },
    ];

    const handleChange = (key: keyof EvalWeights, value: number) => {
        const next = { ...w, [key]: Math.max(0, value) };
        setW(next);
        const t = Object.values(next).reduce((a, b) => a + b, 0);
        if (t === 100) { setWeights(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
        else setSaved(false);
    };

    return (
        <ConfigSection title="Distribución evaluativa"
            description="Define el peso porcentual de cada categoría en la nota final. Debe sumar 100 pts.">
            {ROWS.map(({ key, label, hint }) => (
                <SettingRow key={key} label={label} hint={hint}>
                    <div className={styles.numInputWrap}>
                        <input type="number" min={0} max={100} className={styles.numInput}
                            value={w[key]}
                            onChange={e => handleChange(key, Number(e.target.value))} />
                        <span className={styles.numUnit}>pts</span>
                    </div>
                </SettingRow>
            ))}
            <div className={`${styles.sumRow} ${!valid ? styles.sumWarn : styles.sumOk}`}>
                Total: <strong>{total} / 100</strong>
                {!valid && <span> — debe sumar exactamente 100</span>}
                <SavedBadge saved={saved} />
            </div>
        </ConfigSection>
    );
}

// ─── Semestres ────────────────────────────────────────────────────────────────
function SemestresSection() {
    const { semConfig, saveGlobalConfig, loadAll, asignaturaId } = useAsistenciaStore();
    const asignaturas = useAsignaturasStore(s => s.asignaturas);
    const institution = useInstitutionStore(selectCurrentInstitution);
    const asigYear    = asignaturas[0]?.año ?? new Date().getFullYear();

    useEffect(() => {
        if (!asignaturaId && asignaturas[0] && institution.id)
            loadAll(asignaturas[0].id, institution.id);
    }, [asignaturas, institution.id]);

    type FK = "s1Start"|"s1End"|"s2Start"|"s2End";
    const [form, setForm] = useState({
        s1Start: parseDateParts(semConfig.s1Start), s1End: parseDateParts(semConfig.s1End),
        s2Start: parseDateParts(semConfig.s2Start), s2End: parseDateParts(semConfig.s2End),
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setForm({
            s1Start: parseDateParts(semConfig.s1Start), s1End: parseDateParts(semConfig.s1End),
            s2Start: parseDateParts(semConfig.s2Start), s2End: parseDateParts(semConfig.s2End),
        });
    }, [semConfig]);

    const autoSave = async (nextForm: typeof form) => {
        await saveGlobalConfig({
            s1Start: buildFullDate(asigYear, nextForm.s1Start), s1End: buildFullDate(asigYear, nextForm.s1End),
            s2Start: buildFullDate(asigYear, nextForm.s2Start), s2End: buildFullDate(asigYear, nextForm.s2End),
        } as GlobalSemConfig);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const handleChange = (key: FK, part: keyof DateParts) =>
        (e: React.ChangeEvent<HTMLSelectElement|HTMLInputElement>) => {
            const nextForm = { ...form, [key]: { ...form[key], [part]: e.target.value } };
            setSaved(false);
            setForm(nextForm);
            const allFilled = (["s1Start","s1End","s2Start","s2End"] as FK[]).every(
                k => nextForm[k].month && nextForm[k].day
            );
            if (allFilled) autoSave(nextForm);
        };

    return (
        <ConfigSection title="Semestres"
            description={`Fechas de inicio y fin de cada semestre para el año ${asigYear}. Se aplican a todas las asignaturas.`}>
            {(["s1","s2"] as const).map(s => (
                <div key={s} className={styles.semGroup}>
                    <div className={styles.semGroupLabel}>{s === "s1" ? "Semestre I" : "Semestre II"}</div>
                    <SettingRow label="Inicio">
                        <div className={styles.dateWrap}>
                            <select value={form[`${s}Start`].month} onChange={handleChange(`${s}Start`, "month")}>
                                <option value="">Mes</option>
                                {MONTH_NAMES.map((m,i) => <option key={i} value={String(i+1)}>{m}</option>)}
                            </select>
                            <input type="number" min="1" max="31" placeholder="Día"
                                value={form[`${s}Start`].day} onChange={handleChange(`${s}Start`, "day")} className={styles.dayInput} />
                        </div>
                    </SettingRow>
                    <SettingRow label="Fin">
                        <div className={styles.dateWrap}>
                            <select value={form[`${s}End`].month} onChange={handleChange(`${s}End`, "month")}>
                                <option value="">Mes</option>
                                {MONTH_NAMES.map((m,i) => <option key={i} value={String(i+1)}>{m}</option>)}
                            </select>
                            <input type="number" min="1" max="31" placeholder="Día"
                                value={form[`${s}End`].day} onChange={handleChange(`${s}End`, "day")} className={styles.dayInput} />
                        </div>
                    </SettingRow>
                </div>
            ))}
            <div className={styles.savedRow}><SavedBadge saved={saved} /></div>
        </ConfigSection>
    );
}

// ─── Duración de lección ──────────────────────────────────────────────────────
function LeccionSection() {
    const { duracionLeccion, setDuracionLeccion } = useConfiguracionStore();
    const [val, setVal] = useState(duracionLeccion);
    const [saved, setSaved] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = Math.max(1, Number(e.target.value));
        setVal(next);
        setDuracionLeccion(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <ConfigSection title="Lecciones"
            description="Duración estándar de cada lección para el cálculo de horas.">
            <SettingRow label="Duración por lección" hint="Tiempo en minutos de cada período de clase">
                <div className={styles.numInputWrap}>
                    <input type="number" min={1} max={240} className={styles.numInput}
                        value={val} onChange={handleChange} />
                    <span className={styles.numUnit}>min</span>
                </div>
            </SettingRow>
            <div className={styles.savedRow}><SavedBadge saved={saved} /></div>
        </ConfigSection>
    );
}

// ─── Priority selector ────────────────────────────────────────────────────────
function PrioritySelect({ value, onChange, disabled }: {
    value: NotifPriority; onChange: (v: NotifPriority) => void; disabled?: boolean;
}) {
    return (
        <select className={styles.prioritySelect} value={value} disabled={disabled}
            onChange={e => onChange(e.target.value as NotifPriority)}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
        </select>
    );
}

// ─── Alertas ──────────────────────────────────────────────────────────────────
function AlertasSection() {
    const cfg = useConfiguracionStore();
    const [notaOn,   setNotaOn]   = useState(cfg.alertaNotaEnabled);
    const [nota,     setNota]     = useState(cfg.alertaNotaMinima);
    const [notaPri,  setNotaPri]  = useState<NotifPriority>(cfg.alertaNotaPrioridad);
    const [cotOn,    setCotOn]    = useState(cfg.alertaConductaEnabled);
    const [cot,      setCot]      = useState(cfg.alertaConductaMinima);
    const [cotPri,   setCotPri]   = useState<NotifPriority>(cfg.alertaConductaPrioridad);
    const [saved,    setSaved]    = useState(false);

    const save = (patch: { notaOn?: boolean; nota?: number; notaPri?: NotifPriority; cotOn?: boolean; cot?: number; cotPri?: NotifPriority }) => {
        cfg.setAlertas({
            alertaNotaEnabled:        patch.notaOn  ?? notaOn,
            alertaNotaMinima:         patch.nota    ?? nota,
            alertaNotaPrioridad:      patch.notaPri ?? notaPri,
            alertaConductaEnabled:   patch.cotOn   ?? cotOn,
            alertaConductaMinima:    patch.cot     ?? cot,
            alertaConductaPrioridad: patch.cotPri  ?? cotPri,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <ConfigSection title="Alertas"
            description="Notificaciones automáticas cuando un estudiante baje del umbral definido.">
            <SettingRow label="Nota total mínima" hint="Alerta cuando la nota final de un estudiante baje de este valor">
                <div className={styles.alertControl}>
                    <Toggle checked={notaOn} onChange={v => { setNotaOn(v); save({ notaOn: v }); }} />
                    <div className={styles.numInputWrap}>
                        <input type="number" min={0} max={100} className={styles.numInput}
                            disabled={!notaOn} value={nota}
                            onChange={e => { const v = Math.max(0, Number(e.target.value)); setNota(v); save({ nota: v }); }} />
                        <span className={styles.numUnit}>pts</span>
                    </div>
                    <PrioritySelect value={notaPri} disabled={!notaOn}
                        onChange={v => { setNotaPri(v); save({ notaPri: v }); }} />
                </div>
            </SettingRow>
            <SettingRow label="Conducta mínima" hint="Alerta cuando la conducta de un estudiante baje de este valor">
                <div className={styles.alertControl}>
                    <Toggle checked={cotOn} onChange={v => { setCotOn(v); save({ cotOn: v }); }} />
                    <div className={styles.numInputWrap}>
                        <input type="number" min={0} max={100} className={styles.numInput}
                            disabled={!cotOn} value={cot}
                            onChange={e => { const v = Math.max(0, Number(e.target.value)); setCot(v); save({ cot: v }); }} />
                        <span className={styles.numUnit}>%</span>
                    </div>
                    <PrioritySelect value={cotPri} disabled={!cotOn}
                        onChange={v => { setCotPri(v); save({ cotPri: v }); }} />
                </div>
            </SettingRow>
            <div className={styles.savedRow}><SavedBadge saved={saved} /></div>
        </ConfigSection>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function ConfiguracionPage() {
    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Configuración</h2>
                <p className={styles.pageSubtitle}>Administra las preferencias y parámetros del sistema.</p>
            </div>
            <div className={styles.sections}>
                <WeightsSection />
                <SemestresSection />
                <LeccionSection />
                <AlertasSection />
            </div>
        </div>
    );
}
