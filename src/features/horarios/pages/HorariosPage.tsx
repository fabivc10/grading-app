import { useState, useMemo, useRef, useEffect } from "react";
import { useHorariosStore } from "../store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore } from "../../institution/store";
import type { ScheduleEntry, Break, DragState, DragPayload } from "../types";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { FormField } from "../../../shared/ui/FormField";
import styles from "../HorariosPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const SLOT_COUNT   = 60;   // 7:00 → 16:50, one slot = 10 min
const SLOT_HEIGHT  = 16;   // px per 10-min slot
const LESSON_SLOTS = 4;    // each lesson = 4 × 10 min = 40 min
const COLUMN_HEIGHT = SLOT_COUNT * SLOT_HEIGHT; // 960 px

const DAYS      = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DAY_SHORT = ["L", "M", "X", "J", "V"];
const BREAK_PRESETS = ["Recreo", "Almuerzo", "Personalizado"];
const ACCENT_CLASSES = [styles.a0, styles.a1, styles.a2, styles.a3, styles.a4, styles.a5];
const ACCENT_COLORS  = ["#777","#555","#999","#444","#aaa","#666"];

// time slot array  7:00, 7:10 … 16:50
const TIME_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const mins = 7 * 60 + i * 10;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

// labels shown in the time column (every 6 slots = every 60 min)
const TIME_LABELS = Array.from({ length: SLOT_COUNT }, (_, i) => i)
    .filter((i) => i % 6 === 0)
    .map((i) => ({ slot: i, label: TIME_SLOTS[i] }));

const timeToSlot = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Math.max(0, Math.min(SLOT_COUNT - 1, Math.round((h * 60 + m - 7 * 60) / 10)));
};
const slotToTime = (slot: number): string => {
    const mins = 7 * 60 + slot * 10;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};


// ─── Break Modal ──────────────────────────────────────────────────────────────
function BreakModal({ onSave, onClose }: {
    onSave: (b: Omit<Break, "id">) => void;
    onClose: () => void;
}) {
    const [preset,    setPreset]    = useState("Recreo");
    const [custom,    setCustom]    = useState("");
    const [startTime, setStartTime] = useState("09:00");
    const [minutes,   setMinutes]   = useState(20);
    const [days,      setDays]      = useState<number[]>([0, 1, 2, 3, 4]);

    const durationSlots = Math.max(1, Math.round(minutes / 10));
    const startSlot     = timeToSlot(startTime);
    const nombre        = preset === "Personalizado" ? custom.trim() : preset;
    const valid         = nombre !== "" && days.length > 0 && minutes > 0;

    const toggleDay = (d: number) =>
        setDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort());

    const endSlot   = Math.min(SLOT_COUNT - 1, startSlot + durationSlots - 1);
    const endTime   = TIME_SLOTS[Math.min(endSlot + 1, SLOT_COUNT - 1)] ?? TIME_SLOTS[SLOT_COUNT - 1];

    const footer = (
        <>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button className={styles.saveBtn} disabled={!valid}
                onClick={() => valid && onSave({ nombre, startSlot, durationSlots, days })}>
                Añadir break
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title="Nuevo break" footer={footer}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <FormField label="Tipo">
                    <select className={styles.formInput} value={preset} onChange={(e) => setPreset(e.target.value)}>
                        {BREAK_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </FormField>
                {preset === "Personalizado" && (
                    <FormField label="Nombre">
                        <input className={styles.formInput} type="text" value={custom} onChange={(e) => setCustom(e.target.value)}
                            placeholder="Ej: Tutoría" autoFocus />
                    </FormField>
                )}
                <div className={styles.row2}>
                    <FormField label="Hora de inicio">
                        <input className={styles.formInput} type="time" min="07:00" max="16:50" step="600"
                            value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </FormField>
                    <FormField label="Duración (min)">
                        <input className={styles.formInput} type="number" min={1} max={240}
                            value={minutes || ""} onChange={(e) => setMinutes(Number(e.target.value))} />
                    </FormField>
                </div>
                <FormField label="Días">
                    <div className={styles.dayToggleRow}>
                        {DAY_SHORT.map((lbl, i) => (
                            <button key={i} type="button"
                                className={`${styles.dayToggle}${days.includes(i) ? ` ${styles.dayToggleOn}` : ""}`}
                                onClick={() => toggleDay(i)}>{lbl}</button>
                        ))}
                    </div>
                </FormField>
                {valid && (
                    <p className={styles.breakHint}>
                        {durationSlots} bloque{durationSlots > 1 ? "s" : ""} de 10 min
                        · {TIME_SLOTS[startSlot]} → {endTime}
                    </p>
                )}
            </div>
        </Modal>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function HorariosPage() {
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const institutionId = useInstitutionStore((s) => s.currentId);

    const entries    = useHorariosStore((s) => s.entries);
    const breaks     = useHorariosStore((s) => s.breaks);
    const addEntry    = useHorariosStore((s) => s.addEntry);
    const moveEntry   = useHorariosStore((s) => s.moveEntry);
    const removeEntry = useHorariosStore((s) => s.removeEntry);
    const addBreak    = useHorariosStore((s) => s.addBreak);
    const removeBreak = useHorariosStore((s) => s.removeBreak);

    const [showBreakModal, setShowBreakModal] = useState(false);
    const [drag,           setDrag]           = useState<DragState | null>(null);
    const [overCell,       setOverCell]       = useState<{ day: number; slot: number } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    useEffect(() => { dragRef.current = drag; }, [drag]);

    // panel filters
    const [search,      setSearch]      = useState("");
    const [filterAño,   setFilterAño]   = useState("");
    const [filterGrupo, setFilterGrupo] = useState("");
    const [sort,        setSort]        = useState<"az"|"za"|"lec-desc"|"lec-asc">("az");

    const años   = useMemo(() => [...new Set(asignaturas.map((a) => a.año))].sort((a, b) => b - a), [asignaturas]);
    const grupos = useMemo(() => [...new Set(asignaturas.map((a) => a.grupo))].sort(), [asignaturas]);

    const filteredAsigs = useMemo(() => {
        const q = search.toLowerCase();
        let list = asignaturas.filter((a) =>
            (!q || a.nombre.toLowerCase().includes(q) || a.grupo.toLowerCase().includes(q)) &&
            (!filterAño   || a.año === Number(filterAño)) &&
            (!filterGrupo || a.grupo === filterGrupo)
        );
        return [...list].sort((a, b) => {
            if (sort === "az")       return a.nombre.localeCompare(b.nombre);
            if (sort === "za")       return b.nombre.localeCompare(a.nombre);
            if (sort === "lec-desc") return b.lecciones - a.lecciones;
            return a.lecciones - b.lecciones;
        });
    }, [asignaturas, search, filterAño, filterGrupo, sort]);

    // each entry occupies LESSON_SLOTS consecutive slots → map all of them
    const cellMap = useMemo(() => {
        const m: Record<string, ScheduleEntry> = {};
        entries.forEach((e) => {
            for (let s = e.slot; s < e.slot + LESSON_SLOTS; s++)
                m[`${e.day}-${s}`] = e;
        });
        return m;
    }, [entries]);

    const breakMap = useMemo(() => {
        const m: Record<string, Break> = {};
        breaks.forEach((b) => {
            for (let s = b.startSlot; s < b.startSlot + b.durationSlots && s < SLOT_COUNT; s++)
                b.days.forEach((d) => { m[`${d}-${s}`] = b; });
        });
        return m;
    }, [breaks]);

    const placedCount = (asigId: string) => entries.filter((e) => e.asignaturaId === asigId).length;

    // ── Validity ──────────────────────────────────────────────────────────────
    const isValidDrop = (day: number, slot: number): boolean => {
        const p = drag?.payload;
        if (!p) return false;
        if (slot < 0 || slot + LESSON_SLOTS > SLOT_COUNT) return false;
        for (let s = slot; s < slot + LESSON_SLOTS; s++) {
            if (breakMap[`${day}-${s}`]) return false;
            const occ = cellMap[`${day}-${s}`];
            if (occ) {
                if (p.kind === "panel") return false;
                if (p.kind === "entry" && occ.id !== p.entryId) return false;
            }
        }
        if (p.kind === "panel") {
            const asig = asignaturas.find((a) => a.id === p.asignaturaId);
            return asig ? placedCount(p.asignaturaId) < asig.lecciones : false;
        }
        return true;
    };

    // ── Commit drop ───────────────────────────────────────────────────────────
    const commitDrop = (day: number, slot: number) => {
        const p = dragRef.current?.payload;
        if (!p || !isValidDrop(day, slot)) return;
        if (p.kind === "panel") {
            const placed = placedCount(p.asignaturaId);
            addEntry(institutionId, { asignaturaId: p.asignaturaId, day, slot, leccionNum: placed + 1 });
        } else {
            moveEntry(p.entryId, day, slot);
        }
    };

    // ── Break management ──────────────────────────────────────────────────────
    const handleAddBreak = (b: Omit<Break, "id">) => {
        addBreak(institutionId, b);
        setShowBreakModal(false);
    };

    // ── Global mouse tracking ─────────────────────────────────────────────────
    useEffect(() => {
        if (!drag) return;
        const grabOffset = drag.grabOffset;

        const onMove = (e: MouseEvent) => {
            setDrag((d) => d ? { ...d, x: e.clientX, y: e.clientY } : null);
            const el  = document.elementFromPoint(e.clientX, e.clientY);
            const col = (el as HTMLElement)?.closest?.("[data-day-col]") as HTMLElement | null;
            if (col) {
                const rect    = col.getBoundingClientRect();
                const rawSlot = Math.floor((e.clientY - rect.top) / SLOT_HEIGHT);
                const slot    = Math.max(0, Math.min(SLOT_COUNT - LESSON_SLOTS, rawSlot - grabOffset));
                setOverCell({ day: Number(col.dataset.dayCol), slot });
            } else {
                setOverCell(null);
            }
        };

        const onUp = (e: MouseEvent) => {
            const el  = document.elementFromPoint(e.clientX, e.clientY);
            const col = (el as HTMLElement)?.closest?.("[data-day-col]") as HTMLElement | null;
            if (col) {
                const rect    = col.getBoundingClientRect();
                const rawSlot = Math.floor((e.clientY - rect.top) / SLOT_HEIGHT);
                const slot    = Math.max(0, Math.min(SLOT_COUNT - LESSON_SLOTS, rawSlot - grabOffset));
                commitDrop(Number(col.dataset.dayCol), slot);
            }
            setDrag(null);
            setOverCell(null);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup",   onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup",   onUp);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drag]);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className={styles.page} style={{ userSelect: drag ? "none" : undefined }}>

            {/* Ghost */}
            {drag && (
                <div className={styles.ghost} style={{ left: drag.x + 14, top: drag.y - 10 }}>
                    <span className={styles.ghostName}>{drag.payload.label}</span>
                    <span className={styles.ghostSub}>{drag.payload.subLabel}</span>
                </div>
            )}

            {/* ── Panel ── */}
            <aside className={styles.panel}>
                <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>Asignaturas</p>
                    <span className={styles.panelHint}>Arrastra al horario</span>
                </div>

                <div className={styles.panelToolbar}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Buscar..." />
                    <div className={styles.filterRow}>
                        <select className={styles.filterSelect} value={filterAño} onChange={(e) => setFilterAño(e.target.value)}>
                            <option value="">Año</option>
                            {años.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select className={styles.filterSelect} value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)}>
                            <option value="">Grupo</option>
                            {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <select className={styles.filterSelect} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                        <option value="az">A → Z</option>
                        <option value="za">Z → A</option>
                        <option value="lec-desc">Más lecciones</option>
                        <option value="lec-asc">Menos lecciones</option>
                    </select>
                    {(search || filterAño || filterGrupo) && (
                        <button className={styles.clearAll}
                            onClick={() => { setSearch(""); setFilterAño(""); setFilterGrupo(""); }}>
                            Limpiar filtros
                        </button>
                    )}
                </div>

                <div className={styles.panelList}>
                    {filteredAsigs.length === 0 && (
                        <p className={styles.emptyPanel}>
                            {asignaturas.length === 0
                                ? <><span>Sin asignaturas.</span><br /><span>Créalas en la sección Asignaturas.</span></>
                                : "Sin resultados"}
                        </p>
                    )}
                    {filteredAsigs.map((asig) => {
                        const realIdx = asignaturas.indexOf(asig);
                        const placed  = placedCount(asig.id);
                        const full    = placed >= asig.lecciones;
                        const pct     = Math.min(100, (placed / asig.lecciones) * 100);
                        return (
                            <div key={asig.id}
                                className={`${styles.panelCard}${full ? ` ${styles.full}` : ""}`}
                                onMouseDown={(e) => {
                                    if (full) return;
                                    e.preventDefault();
                                    const payload: DragPayload = {
                                        kind: "panel",
                                        asignaturaId: asig.id,
                                        label: asig.nombre,
                                        subLabel: `${asig.grupo} · ${asig.año}`,
                                    };
                                    setDrag({ payload, grabOffset: 0, x: e.clientX, y: e.clientY });
                                }}
                            >
                                <p className={styles.panelCardName}>{asig.nombre}</p>
                                <p className={styles.panelCardMeta}>{asig.grupo} · {asig.año}</p>
                                <div className={styles.countRow}>
                                    <div className={styles.countTrack}>
                                        <div className={`${styles.countFill}${full ? ` ${styles.done}` : ""}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={styles.countText}>{placed}/{asig.lecciones} lec.{full && " ✓"}</span>
                                </div>
                                <div style={{ marginTop: "0.3rem", height: "2px", borderRadius: "1px",
                                    background: ACCENT_COLORS[realIdx % 6], opacity: 0.6 }} />
                            </div>
                        );
                    })}
                </div>

                {/* Breaks section */}
                <div className={styles.breakSection}>
                    <div className={styles.breakSectionHead}>
                        <span className={styles.breakSectionTitle}>Breaks</span>
                        <button className={styles.addBreakBtn} onClick={() => setShowBreakModal(true)}>+</button>
                    </div>
                    {breaks.length > 0 && (
                        <div className={styles.breakList}>
                            {breaks.map((b) => (
                                <div key={b.id} className={styles.breakItem}>
                                    <div className={styles.breakItemInfo}>
                                        <span className={styles.breakItemName}>{b.nombre}</span>
                                        <span className={styles.breakItemMeta}>
                                            {TIME_SLOTS[b.startSlot]} · {b.durationSlots * 10}min · {b.days.map((d) => DAY_SHORT[d]).join(" ")}
                                        </span>
                                    </div>
                                    <button className={styles.breakRemove} onClick={() => removeBreak(b.id)}>×</button>
                                </div>
                            ))}
                        </div>
                    )}
                    {breaks.length === 0 && <p className={styles.emptyBreak}>Sin breaks definidos</p>}
                </div>
            </aside>

            {/* ── Schedule ── */}
            <div className={styles.scheduleWrap}>
                <div className={styles.schedule}>

                    {/* Sticky header row */}
                    <div className={styles.scheduleHeader}>
                        <div className={styles.cornerCell} />
                        {DAYS.map((d) => <div key={d} className={styles.dayHeader}>{d}</div>)}
                    </div>

                    {/* Body: time column + 5 day columns */}
                    <div className={styles.scheduleBody}>

                        {/* Time labels */}
                        <div className={styles.timeColumn} style={{ height: COLUMN_HEIGHT }}>
                            {TIME_LABELS.map(({ slot, label }) => (
                                <div key={slot} className={styles.timeLabel}
                                    style={{ top: slot * SLOT_HEIGHT, height: SLOT_HEIGHT * 6 }}>
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Day columns */}
                        {Array.from({ length: 5 }, (_, di) => {
                            const dayEntries = entries.filter((e) => e.day === di);
                            const dayBreaks  = breaks.filter((b) => b.days.includes(di));
                            const isHover    = overCell?.day === di;
                            const hoverSlot  = overCell?.slot ?? 0;
                            const hoverValid = isHover && isValidDrop(di, hoverSlot);

                            return (
                                <div key={di} className={styles.dayColumn}
                                    data-day-col={di}
                                    style={{ height: COLUMN_HEIGHT }}>

                                    {/* Slot background lines */}
                                    {Array.from({ length: SLOT_COUNT }, (_, si) => (
                                        <div key={si} className={`${styles.slotLine}${(si + 1) % 6 === 0 ? ` ${styles.slotLineHour}` : (si + 1) % 4 === 0 ? ` ${styles.slotLine40}` : ""}`}
                                            style={{ top: si * SLOT_HEIGHT, height: SLOT_HEIGHT }} />
                                    ))}

                                    {/* Breaks */}
                                    {dayBreaks.map((b) => (
                                        <div key={b.id} className={styles.breakCell}
                                            style={{ top: b.startSlot * SLOT_HEIGHT, height: b.durationSlots * SLOT_HEIGHT }}>
                                            <span className={styles.breakCellLabel}>{b.nombre}</span>
                                            <span className={styles.breakCellTime}>
                                                {slotToTime(b.startSlot)} – {slotToTime(b.startSlot + b.durationSlots)}
                                            </span>
                                        </div>
                                    ))}

                                    {/* Entries */}
                                    {dayEntries.map((entry) => {
                                        const asig    = asignaturas.find((a) => a.id === entry.asignaturaId);
                                        if (!asig) return null;
                                        const asigIdx = asignaturas.indexOf(asig);
                                        const tStart  = slotToTime(entry.slot);
                                        const tEnd    = slotToTime(entry.slot + LESSON_SLOTS);
                                        return (
                                            <div key={entry.id}
                                                className={`${styles.entry} ${ACCENT_CLASSES[asigIdx % 6]}`}
                                                style={{ top: entry.slot * SLOT_HEIGHT, height: LESSON_SLOTS * SLOT_HEIGHT }}
                                                title={`${asig.nombre} — ${asig.grupo} ${asig.año}\nLección ${entry.leccionNum}\n${tStart}–${tEnd}`}
                                                onMouseDown={(e) => {
                                                    e.preventDefault(); e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const grabOffset = Math.min(LESSON_SLOTS - 1, Math.floor((e.clientY - rect.top) / SLOT_HEIGHT));
                                                    const payload: DragPayload = {
                                                        kind: "entry",
                                                        entryId: entry.id,
                                                        label: asig.nombre,
                                                        subLabel: `${asig.grupo} · ${asig.año}`,
                                                    };
                                                    setDrag({ payload, grabOffset, x: e.clientX, y: e.clientY });
                                                }}
                                            >
                                                <button className={styles.entryRemove}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}>
                                                    ×
                                                </button>
                                                <span className={styles.entryName}>{asig.nombre}</span>
                                                <span className={styles.entryMeta}>{asig.grupo} · {asig.año}</span>
                                                <div className={styles.entryFoot}>
                                                    <span className={styles.entryTime}>{tStart}–{tEnd}</span>
                                                    <span className={styles.entryLec}>#{entry.leccionNum}</span>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Drop hint overlay */}
                                    {isHover && drag && (
                                        <div className={`${styles.dropHint} ${hoverValid ? styles.dropHintOk : styles.dropHintBad}`}
                                            style={{ top: hoverSlot * SLOT_HEIGHT, height: LESSON_SLOTS * SLOT_HEIGHT }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {showBreakModal && <BreakModal onSave={handleAddBreak} onClose={() => setShowBreakModal(false)} />}
        </div>
    );
}
