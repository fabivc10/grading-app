import { useState, useEffect, useMemo, useRef } from "react";
import { useAsistenciaStore } from "../../asistencia/store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore, selectCurrentInstitution } from "../../institution/store";
import { useConfiguracionStore, DEFAULT_NIVEL_CONFIG, DEFAULT_RANGO_NUMERICA, DEFAULT_RANGO_ANALITICA } from "../store";
import { TrashIcon } from "../../../shared/ui/icons";
import type { Umbral } from "../store";
import type { NivelConfig } from "../../evaluaciones/types";
import type { GlobalSemConfig } from "../../asistencia/types";
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

// ─── Distribución evaluativa por nivel ────────────────────────────────────────
function NivelesSection() {
    const asignaturas    = useAsignaturasStore(s => s.asignaturas);
    const nivelConfigs   = useConfiguracionStore(s => s.nivelConfigs);
    const setNivelConfig = useConfiguracionStore(s => s.setNivelConfig);

    const niveles = useMemo(() =>
        [...asignaturas]
            .sort((a, b) => a.año !== b.año ? b.año - a.año : a.grupo !== b.grupo ? a.grupo - b.grupo : a.seccion - b.seccion)
            .map(a => ({ id: a.id, key: `${a.año}-${a.grupo}`, nombre: a.nombre, grupo: a.grupo, seccion: a.seccion, año: a.año })),
        [asignaturas]
    );

    const años = useMemo(() => [...new Set(niveles.map(n => n.año))].sort((a, b) => b - a), [niveles]);
    const [filterAño, setFilterAño] = useState<number | null>(null);
    const visibles = useMemo(() => filterAño ? niveles.filter(n => n.año === filterAño) : niveles, [niveles, filterAño]);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [cfg, setCfg] = useState<NivelConfig>({ ...DEFAULT_NIVEL_CONFIG });

    const toggle = (key: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); }
            else {
                next.add(key);
                // Load config of first-selected when only one was active
                if (next.size === 1) setCfg({ ...(nivelConfigs[key] ?? DEFAULT_NIVEL_CONFIG) });
            }
            return next;
        });
    };

    const update = (field: keyof NivelConfig, val: number) => {
        const next: NivelConfig = { ...cfg, [field]: Math.max(0, val) };
        if (field === "numProyectos" && val === 0) next.proyecto = 0;
        setCfg(next);
        const t = next.cotidiano + next.tareas + next.prueba + (next.numProyectos > 0 ? next.proyecto : 0) + next.asistencia;
        if (t === 100) selected.forEach(key => setNivelConfig(key, next));
    };

    const total = cfg.cotidiano + cfg.tareas + cfg.prueba + (cfg.numProyectos > 0 ? cfg.proyecto : 0) + cfg.asistencia;
    const valid = total === 100;

    const numInput = (field: keyof NivelConfig, max: number, disabled?: boolean) => (
        <div className={styles.numInputWrap}>
            <input type="number" min={0} max={max} className={styles.numInput}
                value={cfg[field]} disabled={disabled}
                onChange={e => update(field, Number(e.target.value))} />
        </div>
    );

    return (
        <ConfigSection title="Distribución evaluativa por nivel"
            description="Selecciona uno o varios grupos, configura la distribución y guarda.">

            {niveles.length === 0 && (
                <div style={{ padding: "0.75rem 1.25rem", fontSize: "0.8rem", color: "var(--tx-3)" }}>
                    No hay asignaturas registradas aún.
                </div>
            )}

            {/* ── Año filter ── */}
            {años.length > 1 && (
                <div className={styles.nivelChips} style={{ borderBottom: "none", paddingBottom: 0 }}>
                    <button type="button"
                        className={`${styles.nivelChip}${filterAño === null ? ` ${styles.nivelChipActive}` : ""}`}
                        onClick={() => setFilterAño(null)}>
                        Todos
                    </button>
                    {años.map(a => (
                        <button key={a} type="button"
                            className={`${styles.nivelChip}${filterAño === a ? ` ${styles.nivelChipActive}` : ""}`}
                            onClick={() => setFilterAño(a)}>
                            {a}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Chip selector ── */}
            {niveles.length > 0 && (
                <div className={styles.nivelChips}>
                    {visibles.map(({ id, key, nombre, grupo, seccion, año }) => (
                        <button key={id} type="button"
                            className={`${styles.nivelChip}${selected.has(key) ? ` ${styles.nivelChipActive}` : ""}`}
                            onClick={() => toggle(key)}>
                            {nombre} {grupo}-{seccion} ({año})
                        </button>
                    ))}
                </div>
            )}

            {/* ── Config form — only when groups selected ── */}
            {selected.size > 0 && (
                <div className={styles.nivelForm}>
                    <div className={styles.nivelFormGrid}>
                        <div className={styles.nivelFormCell}>
                            <div className={styles.nivelFormLabel}>Cotidiano</div>
                            <div className={styles.nivelInputGroup}>
                                {numInput("cotidiano", 100)}
                                <span className={styles.numUnit}>%</span>
                            </div>
                        </div>
                        <div className={styles.nivelFormCell}>
                            <div className={styles.nivelFormLabel}>Tareas</div>
                            <div className={styles.nivelInputGroup}>
                                {numInput("numTareas", 30)}
                                <span className={styles.nivelInputSep}>×</span>
                                {numInput("tareas", 100)}
                                <span className={styles.numUnit}>%</span>
                            </div>
                        </div>
                        <div className={styles.nivelFormCell}>
                            <div className={styles.nivelFormLabel}>Pruebas</div>
                            <div className={styles.nivelInputGroup}>
                                {numInput("numPruebas", 30)}
                                <span className={styles.nivelInputSep}>×</span>
                                {numInput("prueba", 100)}
                                <span className={styles.numUnit}>%</span>
                            </div>
                        </div>
                        <div className={styles.nivelFormCell}>
                            <div className={styles.nivelFormLabel}>Proyectos</div>
                            <div className={styles.nivelInputGroup}>
                                {numInput("numProyectos", 10)}
                                <span className={styles.nivelInputSep}>×</span>
                                {numInput("proyecto", 100, cfg.numProyectos === 0)}
                                <span className={styles.numUnit}>%</span>
                            </div>
                        </div>
                        <div className={`${styles.nivelFormCell} ${styles.nivelFormCellLast}`}>
                            <div className={styles.nivelFormLabel}>Asistencia</div>
                            <div className={styles.nivelInputGroup}>
                                {numInput("asistencia", 100)}
                                <span className={styles.numUnit}>%</span>
                            </div>
                        </div>
                        <div className={`${styles.nivelFormCell} ${styles.nivelFormActions}`}>
                            <span className={`${styles.nivelTotal} ${!valid ? styles.sumWarn : styles.sumOk}`}>
                                {total}/100
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Summary table ── */}
            {niveles.length > 0 && (
                <div className={styles.nivelSummary}>
                    <div className={styles.nivelSummaryHead}>
                        <span>Asignatura</span>
                        <span>Cotidiano</span>
                        <span>Tareas</span>
                        <span>Pruebas</span>
                        <span>Proyectos</span>
                        <span>Asistencia</span>
                    </div>
                    {niveles.map(({ id, key, nombre, grupo, seccion, año }) => {
                        const c = nivelConfigs[key] ?? DEFAULT_NIVEL_CONFIG;
                        return (
                            <div key={id} className={`${styles.nivelSummaryRow}${selected.has(key) ? ` ${styles.nivelSummaryRowActive}` : ""}`}
                                onClick={() => toggle(key)}>
                                <span className={styles.nivelSummaryGrupo}>{nombre} {grupo}-{seccion} ({año})</span>
                                <span>{c.cotidiano}%</span>
                                <span>{c.numTareas} × {c.tareas}%</span>
                                <span>{c.numPruebas} × {c.prueba}%</span>
                                <span>{c.numProyectos > 0 ? `${c.numProyectos} × ${c.proyecto}%` : "—"}</span>
                                <span>{c.asistencia}%</span>
                            </div>
                        );
                    })}
                </div>
            )}
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
    };

    const handleChange = (key: FK, part: keyof DateParts) =>
        (e: React.ChangeEvent<HTMLSelectElement|HTMLInputElement>) => {
            const nextForm = { ...form, [key]: { ...form[key], [part]: e.target.value } };
            setForm(nextForm);
            const allFilled = (["s1Start","s1End","s2Start","s2End"] as FK[]).every(
                k => nextForm[k].month && nextForm[k].day
            );
            if (allFilled) autoSave(nextForm);
        };

    const DatePicker = ({ fk }: { fk: FK }) => (
        <div className={styles.dateWrap}>
            <select value={form[fk].month} onChange={handleChange(fk, "month")}>
                <option value="">Mes</option>
                {MONTH_NAMES.map((m,i) => <option key={i} value={String(i+1)}>{m}</option>)}
            </select>
            <input type="number" min="1" max="31" placeholder="Día"
                value={form[fk].day} onChange={handleChange(fk, "day")} className={styles.dayInput} />
        </div>
    );

    return (
        <ConfigSection title="Semestres"
            description={`Inicio y fin de cada semestre — ${asigYear}.`}>
            <div className={styles.semCompact}>
                {(["s1","s2"] as const).map(s => (
                    <div key={s} className={styles.semCompactRow}>
                        <span className={styles.semCompactLabel}>{s === "s1" ? "Semestre I" : "Semestre II"}</span>
                        <DatePicker fk={`${s}Start`} />
                        <span className={styles.semCompactSep}>→</span>
                        <DatePicker fk={`${s}End`} />
                    </div>
                ))}
            </div>
        </ConfigSection>
    );
}

// ─── Duración de lección ──────────────────────────────────────────────────────
function LeccionSection() {
    const { duracionLeccion, setDuracionLeccion, defaultLecciones, setDefaultLecciones } = useConfiguracionStore();
    const [dur, setDur] = useState(duracionLeccion);
    const [num, setNum] = useState(defaultLecciones);
    return (
        <ConfigSection title="Lecciones"
            description="Duración por lección y cantidad predeterminada al crear asignaturas.">
            <SettingRow label="Duración por lección" hint="Minutos por período de clase">
                <div className={styles.numInputWrap}>
                    <input type="number" min={1} max={240} className={styles.numInput}
                        value={dur}
                        onChange={e => { const v = Math.max(1, Number(e.target.value)); setDur(v); setDuracionLeccion(v); }} />
                    <span className={styles.numUnit}>min</span>
                </div>
            </SettingRow>
            <SettingRow label="Máximo de lecciones" hint="Límite y valor inicial al crear una asignatura">
                <div className={styles.numInputWrap}>
                    <input type="number" min={1} max={500} className={styles.numInput}
                        value={num}
                        onChange={e => { const v = Math.max(1, Number(e.target.value)); setNum(v); setDefaultLecciones(v); }} />
                    <span className={styles.numUnit}>lec.</span>
                </div>
            </SettingRow>
        </ConfigSection>
    );
}

// ─── Rangos de evaluación ─────────────────────────────────────────────────────
function RangosSection() {
    const rangoNumerica  = useConfiguracionStore(s => s.rangoNumerica)  ?? DEFAULT_RANGO_NUMERICA;
    const rangoAnalitica = useConfiguracionStore(s => s.rangoAnalitica) ?? DEFAULT_RANGO_ANALITICA;
    const setRangoNumerica  = useConfiguracionStore(s => s.setRangoNumerica);
    const setRangoAnalitica = useConfiguracionStore(s => s.setRangoAnalitica);

    const RangoRow = ({ label, hint, rango, setRango }: {
        label: string; hint: string;
        rango: { min: number; max: number };
        setRango: (r: { min: number; max: number }) => void;
    }) => (
        <SettingRow label={label} hint={hint}>
            <div className={styles.numInputWrap}>
                <input type="number" min={0} max={rango.max - 1} className={styles.numInput}
                    value={rango.min}
                    onChange={e => { const v = Number(e.target.value); if (v < rango.max) setRango({ ...rango, min: v }); }} />
                <span className={styles.numUnit}>–</span>
                <input type="number" min={rango.min + 1} max={100} className={styles.numInput}
                    value={rango.max}
                    onChange={e => { const v = Number(e.target.value); if (v > rango.min) setRango({ ...rango, max: v }); }} />
            </div>
        </SettingRow>
    );

    return (
        <ConfigSection title="Rangos de evaluación"
            description="Puntaje mínimo y máximo permitido por indicador según el tipo de evaluación.">
            <RangoRow label="Numérica"  hint="Mide indicadores cuantitativos con una escala de puntos. Ej: precisión, cantidad de errores, puntaje obtenido."  rango={rangoNumerica}  setRango={setRangoNumerica} />
            <RangoRow label="Analítica" hint="Mide indicadores cualitativos representados con valores numéricos. Ej: nivel de comprensión, participación, actitud." rango={rangoAnalitica} setRango={setRangoAnalitica} />
        </ConfigSection>
    );
}

// ─── Alertas / Umbrales ───────────────────────────────────────────────────────
const GripIcon = () => (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
        <circle cx="2" cy="2"  r="1.2"/><circle cx="6" cy="2"  r="1.2"/>
        <circle cx="2" cy="6"  r="1.2"/><circle cx="6" cy="6"  r="1.2"/>
        <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
    </svg>
);

function UmbralMarker({ u, onRemove, onUpdate, barRef, inverted, displayPos }: {
    u: Umbral;
    onRemove: () => void;
    onUpdate: (patch: Partial<Umbral>) => void;
    barRef: React.RefObject<HTMLDivElement | null>;
    inverted: boolean;
    displayPos: number;
}) {
    const [val, setVal] = useState(String(u.valor));
    useEffect(() => { setVal(String(u.valor)); }, [u.id, u.valor]);

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const bar = barRef.current;
        if (!bar) return;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        const onMove = (ev: MouseEvent) => {
            const rect = bar.getBoundingClientRect();
            const pct = Math.round((ev.clientX - rect.left) / rect.width * 100);
            const raw = inverted ? 100 - pct : pct;
            onUpdate({ valor: Math.min(100, Math.max(0, raw)) });
        };
        const onUp = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    return (
        <div className={styles.umbralMarker}
            style={{ left: `clamp(46px, ${displayPos}%, calc(100% - 46px))` }}
            onClick={e => e.stopPropagation()}>
            <div className={styles.umbralMarkerRow}>
                <button className={styles.umbralDragHandle} onMouseDown={handleDragStart}>
                    <GripIcon />
                </button>
                <input type="number" className={styles.umbralValInput}
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onBlur={() => {
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) onUpdate({ valor: Math.min(100, Math.max(0, n)) });
                    }} />
                <span className={styles.umbralValUnit}>%</span>
                <button className={styles.umbralRemoveBtn} onClick={onRemove}><TrashIcon /></button>
            </div>
            <div className={styles.umbralConnector} />
        </div>
    );
}

function UmbralBar({ label, hint, umbrales, setUmbrales, defaultDir, inverted = false, scaleLeft, scaleRight }: {
    label: string;
    hint?: string;
    umbrales: Umbral[];
    setUmbrales: (u: Umbral[]) => void;
    defaultDir: "<" | ">";
    inverted?: boolean;
    scaleLeft: string;
    scaleRight: string;
}) {
    const barRef = useRef<HTMLDivElement>(null);
    const sorted = [...umbrales].sort((a, b) => a.valor - b.valor);
    const disp = (valor: number) => inverted ? 100 - valor : valor;

    // White fill from left up to the highest marker's display position
    const maxDisplayPos = sorted.length > 0 ? Math.max(...sorted.map(u => disp(u.valor))) : 0;

    const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.round((e.clientX - rect.left) / rect.width * 100);
        const raw = inverted ? 100 - pct : pct;
        const valor = Math.min(100, Math.max(0, raw));
        if (sorted.some(u => Math.abs(u.valor - valor) <= 1)) return;
        setUmbrales([...umbrales, { id: crypto.randomUUID(), valor, dir: defaultDir, color: "" }]);
    };

    const remove = (id: string) => setUmbrales(umbrales.filter(u => u.id !== id));
    const update = (id: string, patch: Partial<Umbral>) => {
        let next = umbrales.map(u => u.id === id ? { ...u, ...patch } : u);
        if (patch.valor !== undefined) {
            const s = [...next].sort((a, b) => a.valor - b.valor);
            const i = s.findIndex(u => u.id === id);
            const min = i > 0 ? s[i - 1].valor + 1 : 0;
            const max = i < s.length - 1 ? s[i + 1].valor - 1 : 100;
            const clamped = Math.min(max, Math.max(min, patch.valor));
            next = next.map(u => u.id === id ? { ...u, valor: clamped } : u);
        }
        setUmbrales(next);
    };

    return (
        <div className={styles.umbralSection}>
            <div className={styles.umbralLabel}>{label}</div>
            {hint && <p className={styles.umbralHint}>{hint}</p>}
            <div ref={barRef} className={styles.umbralBar} onClick={handleBarClick}>
                {/* White fill up to highest marker */}
                {maxDisplayPos > 0 && (
                    <div className={styles.umbralSegment} style={{ left: 0, width: `${maxDisplayPos}%` }} />
                )}
                {/* Markers */}
                {sorted.map(u => (
                    <UmbralMarker key={u.id} u={u} barRef={barRef}
                        inverted={inverted} displayPos={disp(u.valor)}
                        onRemove={() => remove(u.id)}
                        onUpdate={patch => update(u.id, patch)} />
                ))}
                {/* Threshold lines */}
                {sorted.map(u => (
                    <div key={u.id} className={styles.umbralThreshLine} style={{ left: `${disp(u.valor)}%` }} />
                ))}
            </div>
            <div className={styles.umbralScale}><span>{scaleLeft}</span><span>{scaleRight}</span></div>
        </div>
    );
}

function AlertasSection() {
    const umbralPromedio    = useConfiguracionStore(s => s.umbralPromedio);
    const umbralAusencias   = useConfiguracionStore(s => s.umbralAusencias);
    const setUmbralPromedio  = useConfiguracionStore(s => s.setUmbralPromedio);
    const setUmbralAusencias = useConfiguracionStore(s => s.setUmbralAusencias);

    return (
        <ConfigSection title="Alertas"
            description="Haz click en la barra para agregar un umbral. Arrastra o edita el valor para moverlo.">
            <UmbralBar
                label="Bajo rendimiento"
                hint="Marca los puntos donde el promedio es preocupante. Si un estudiante baja de ese valor, recibirás una alerta."
                umbrales={umbralPromedio}
                setUmbrales={setUmbralPromedio}
                defaultDir="<"
                scaleLeft="0%"
                scaleRight="100%"
            />
            <UmbralBar
                label="Ausentismo"
                hint="Cada vez que un estudiante supera uno de estos niveles de clases perdidas, se le descuenta 1 punto de su promedio final."
                umbrales={umbralAusencias}
                setUmbrales={setUmbralAusencias}
                defaultDir=">"
                scaleLeft="0%"
                scaleRight="100%"
            />
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
                <NivelesSection />
                <SemestresSection />
                <LeccionSection />
                <RangosSection />
                <AlertasSection />
            </div>
        </div>
    );
}
