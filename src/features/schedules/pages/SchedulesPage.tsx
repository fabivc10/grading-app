import { useState, useMemo, useRef, useEffect } from "react";
import { useHorariosStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { useInstitutionStore } from "../../institution/store";
import type { ScheduleEntry, Break, DragState, DragPayload } from "../types";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { FilterIcon, SortIcon, ChevronDownIcon, CloseIcon } from "../../../shared/ui/icons";
import { useConfiguracionStore } from "../../settings/store";
import styles from "./SchedulesPage.module.css";

type SortKey = "nombre" | "lecciones" | "creacion";
const SORT_LABELS: Record<SortKey, string> = {
    nombre:   "Alfab\u00e9ticamente",
    lecciones: "Lecciones",
    creacion:  "Fecha de creaci\u00f3n",
};

//  Constants 
const SLOT_COUNT    = 60;   // 7:00  16:50, one slot = 10 min
const SLOT_HEIGHT   = 16;   // px per 10-min slot
const COLUMN_HEIGHT = SLOT_COUNT * SLOT_HEIGHT; // 960 px

const DAYS      = ["Lunes", "Martes", "Mi\u00e9rcoles", "Jueves", "Viernes"];
const DAY_SHORT = ["L", "M", "X", "J", "V"];
const ACCENT_CLASSES = [styles.a0, styles.a1, styles.a2, styles.a3, styles.a4, styles.a5];
const ACCENT_COLORS  = ["#777","#555","#999","#444","#aaa","#666"];

// time slot array  7:00, 7:10  16:50
const TIME_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const mins = 7 * 60 + i * 10;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

// labels shown in the time column (every 6 slots = every 60 min)
const TIME_LABELS = Array.from({ length: SLOT_COUNT }, (_, i) => i)
    .filter((i) => i % 6 === 0)
    .map((i) => ({ slot: i, label: TIME_SLOTS[i] }));

const slotToTime = (slot: number): string => {
    const mins = 7 * 60 + slot * 10;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};



//  Page 
export function SchedulesPage() {
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const institutionId = useInstitutionStore((s) => s.currentId);

    const duracionLeccion = useConfiguracionStore((s) => s.duracionLeccion);
    const lessonSlots = Math.max(1, Math.round(duracionLeccion / 10));

    const entries    = useHorariosStore((s) => s.entries);
    const breaks     = useHorariosStore((s) => s.breaks);
    const addEntry    = useHorariosStore((s) => s.addEntry);
    const moveEntry   = useHorariosStore((s) => s.moveEntry);
    const removeEntry = useHorariosStore((s) => s.removeEntry);
    const removeBreak = useHorariosStore((s) => s.removeBreak);

    const [drag,           setDrag]           = useState<DragState | null>(null);
    const [overCell,       setOverCell]       = useState<{ day: number; slot: number } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    useEffect(() => { dragRef.current = drag; }, [drag]);

    // panel filters
    const [search,      setSearch]      = useState("");
    const [filterYear,   setFilterYear]   = useState("");
    const [filterGrupo, setFilterGrupo] = useState("");
    const [sortKey,     setSortKey]     = useState<SortKey>("nombre");
    const [sortDir,     setSortDir]     = useState<"asc" | "desc">("asc");
    const [showFilters, setShowFilters] = useState(false);
    const [showSort,    setShowSort]    = useState(false);
    const [filterSeccion, setFilterSeccion] = useState("");

    const years     = useMemo(() => [...new Set(asignaturas.map((a) => a.year))].sort((a, b) => b - a), [asignaturas]);
    const grupos   = useMemo(() => [...new Set(asignaturas.map((a) => a.grupo))].sort((a, b) => a - b), [asignaturas]);
    const secciones = useMemo(() => [...new Set(asignaturas.map((a) => a.seccion))].sort((a, b) => a - b), [asignaturas]);

    const activeFilterCount = [filterYear, filterGrupo, filterSeccion].filter(Boolean).length;

    const filteredAsigs = useMemo(() => {
        const q = search.toLowerCase();
        let list = asignaturas.filter((a) =>
            (!q || a.nombre.toLowerCase().includes(q) || String(a.grupo).includes(q)) &&
            (!filterYear     || a.year     === Number(filterYear)) &&
            (!filterGrupo   || a.grupo   === Number(filterGrupo)) &&
            (!filterSeccion || a.seccion === Number(filterSeccion))
        );
        const mul = sortDir === "asc" ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sortKey === "nombre")    return mul * (a.nombre.localeCompare(b.nombre) || a.grupo - b.grupo || a.year - b.year);
            if (sortKey === "lecciones") return mul * (a.lecciones - b.lecciones);
            return mul * a.created_at.localeCompare(b.created_at);
        });
    }, [asignaturas, search, filterYear, filterGrupo, filterSeccion, sortKey, sortDir]);

    // each entry occupies lessonSlots consecutive slots  map all of them
    const cellMap = useMemo(() => {
        const m: Record<string, ScheduleEntry> = {};
        entries.forEach((e) => {
            for (let s = e.slot; s < e.slot + lessonSlots; s++)
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

    //  Validity 
    const isValidDrop = (day: number, slot: number): boolean => {
        const p = drag?.payload;
        if (!p) return false;
        if (slot < 0 || slot + lessonSlots > SLOT_COUNT) return false;
        for (let s = slot; s < slot + lessonSlots; s++) {
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

    //  Commit drop 
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

    //  Global mouse tracking 
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
                const slot    = Math.max(0, Math.min(SLOT_COUNT - lessonSlots, rawSlot - grabOffset));
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
                const slot    = Math.max(0, Math.min(SLOT_COUNT - lessonSlots, rawSlot - grabOffset));
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

    // 
    return (
        <div className={styles.page} style={{ userSelect: drag ? "none" : undefined }}>

            {/* Ghost */}
            {drag && (
                <div className={styles.ghost} style={{ left: drag.x + 14, top: drag.y - 10 }}>
                    <span className={styles.ghostName}>{drag.payload.label}</span>
                    <span className={styles.ghostSub}>{drag.payload.subLabel}</span>
                </div>
            )}

            {/*  Panel  */}
            <aside className={styles.panel}>
                <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>Asignaturas</p>
                    <span className={styles.panelHint}>Arrastra al horario</span>
                </div>

                <div className={styles.panelToolbar}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Buscar..." />
                    <div className={styles.filterRow}>
                        {/* Filtrar */}
                        <div className={styles.filterBtnWrap}>
                            <button type="button"
                                className={`${styles.filterToggleBtn}${activeFilterCount > 0 ? ` ${styles.filterToggleActive}` : ""}`}
                                onClick={() => { setShowFilters(v => !v); setShowSort(false); }}>
                                <FilterIcon /> Filtrar
                                {activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
                            </button>
                            {showFilters && (
                                <>
                                    <div className={styles.filterBackdrop} onClick={() => setShowFilters(false)} />
                                    <div className={styles.filterPopover}>
                                        <div className={styles.filterPopoverRow}>
                                            <label>Year</label>
                                            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                                                <option value="">Todos</option>
                                                {years.map((y) => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                        <div className={styles.filterPopoverRow}>
                                            <label>Grupo</label>
                                            <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)}>
                                                <option value="">Todos</option>
                                                {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                        <div className={styles.filterPopoverRow}>
                                            <label>Seccin</label>
                                            <select value={filterSeccion} onChange={(e) => setFilterSeccion(e.target.value)}>
                                                <option value="">Todas</option>
                                                {secciones.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        {activeFilterCount > 0 && (
                                            <button type="button" className={styles.filterClearBtn}
                                                onClick={() => { setFilterYear(""); setFilterGrupo(""); setFilterSeccion(""); }}>
                                                Limpiar filtros
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Ordenar */}
                        <div className={styles.filterBtnWrap}>
                            <button type="button"
                                className={`${styles.filterToggleBtn}${sortKey !== "nombre" || sortDir !== "asc" ? ` ${styles.filterToggleActive}` : ""}`}
                                onClick={() => { setShowSort(v => !v); setShowFilters(false); }}>
                                <SortIcon /> {SORT_LABELS[sortKey]}
                            </button>
                            {showSort && (
                                <>
                                    <div className={styles.filterBackdrop} onClick={() => setShowSort(false)} />
                                    <div className={styles.filterPopover}>
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => {
                                            const active = sortKey === key;
                                            const dir = active ? sortDir : "asc";
                                            return (
                                                <button key={key} type="button"
                                                    className={`${styles.sortOption}${active ? ` ${styles.sortOptionActive}` : ""}`}
                                                    onClick={() => {
                                                        if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
                                                        else { setSortKey(key); setSortDir("asc"); }
                                                    }}>
                                                    {SORT_LABELS[key]}
                                                    <ChevronDownIcon style={{ transform: dir === "asc" ? "rotate(180deg)" : "none", width: 12, height: 12, flexShrink: 0 }} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.panelList}>
                    {filteredAsigs.length === 0 && (
                        <p className={styles.emptyPanel}>
                            {asignaturas.length === 0
                                ? <><span>Sin asignaturas.</span><br /><span>Cralas en la seccin Asignaturas.</span></>
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
                                        subLabel: `${asig.grupo}  ${asig.year}`,
                                    };
                                    setDrag({ payload, grabOffset: 0, x: e.clientX, y: e.clientY });
                                }}
                            >
                                <p className={styles.panelCardName}>{asig.nombre}</p>
                                <p className={styles.panelCardMeta}>{asig.grupo}  {asig.year}</p>
                                <div className={styles.countRow}>
                                    <div className={styles.countTrack}>
                                        <div className={`${styles.countFill}${full ? ` ${styles.done}` : ""}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={styles.countText}>{placed}/{asig.lecciones} lec.{full && " "}</span>
                                </div>
                                <div style={{ marginTop: "0.3rem", height: "2px", borderRadius: "1px",
                                    background: ACCENT_COLORS[realIdx % 6], opacity: 0.6 }} />
                            </div>
                        );
                    })}
                </div>

                {/* Breaks section  creation removed, existing breaks still shown */}
                {breaks.length > 0 && (
                    <div className={styles.breakSection}>
                        <div className={styles.breakSectionHead}>
                            <span className={styles.breakSectionTitle}>Breaks</span>
                        </div>
                        <div className={styles.breakList}>
                            {breaks.map((b) => (
                                <div key={b.id} className={styles.breakItem}>
                                    <div className={styles.breakItemInfo}>
                                        <span className={styles.breakItemName}>{b.nombre}</span>
                                        <span className={styles.breakItemMeta}>
                                            {TIME_SLOTS[b.startSlot]}  {b.durationSlots * 10}min  {b.days.map((d) => DAY_SHORT[d]).join(" ")}
                                        </span>
                                    </div>
                                    <button className={styles.breakRemove} onClick={() => removeBreak(b.id)}></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            {/*  Schedule  */}
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
                                                {slotToTime(b.startSlot)}  {slotToTime(b.startSlot + b.durationSlots)}
                                            </span>
                                        </div>
                                    ))}

                                    {/* Entries */}
                                    {dayEntries.map((entry) => {
                                        const asig    = asignaturas.find((a) => a.id === entry.asignaturaId);
                                        if (!asig) return null;
                                        const asigIdx = asignaturas.indexOf(asig);
                                        const tStart  = slotToTime(entry.slot);
                                        const tEnd    = slotToTime(entry.slot + lessonSlots);
                                        return (
                                            <div key={entry.id}
                                                className={`${styles.entry} ${ACCENT_CLASSES[asigIdx % 6]}`}
                                                style={{ top: entry.slot * SLOT_HEIGHT, height: lessonSlots * SLOT_HEIGHT }}
                                                title={`${asig.nombre}  ${asig.grupo} ${asig.year}\nLeccin ${entry.leccionNum}\n${tStart}${tEnd}`}
                                                onMouseDown={(e) => {
                                                    e.preventDefault(); e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const grabOffset = Math.min(lessonSlots - 1, Math.floor((e.clientY - rect.top) / SLOT_HEIGHT));
                                                    const payload: DragPayload = {
                                                        kind: "entry",
                                                        entryId: entry.id,
                                                        label: asig.nombre,
                                                        subLabel: `${asig.grupo}  ${asig.year}`,
                                                    };
                                                    setDrag({ payload, grabOffset, x: e.clientX, y: e.clientY });
                                                }}
                                            >
                                                <button className={styles.entryRemove}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}>
                                                    <CloseIcon width={8} height={8} />
                                                </button>
                                                <span className={styles.entryName}>{asig.nombre}</span>
                                                <span className={styles.entryMeta}>{asig.grupo}  {asig.year}</span>
                                                <div className={styles.entryFoot}>
                                                    <span className={styles.entryTime}>{tStart}{tEnd}</span>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Drop hint overlay */}
                                    {isHover && drag && (
                                        <div className={`${styles.dropHint} ${hoverValid ? styles.dropHintOk : styles.dropHintBad}`}
                                            style={{ top: hoverSlot * SLOT_HEIGHT, height: lessonSlots * SLOT_HEIGHT }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
}


