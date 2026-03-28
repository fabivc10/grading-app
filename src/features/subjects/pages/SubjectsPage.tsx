import { useState, useMemo } from "react";
import { useAsignaturasStore } from "../store";
import { useInstitutionStore } from "../../institution/store";
import { useConfiguracionStore } from "../../settings/store";
import type { Asignatura, Semestre, AsignaturaFormData } from "../types";
import { PlusIcon, EditIcon, TrashIcon, UsersIcon, BookIcon, SortIcon, ChevronDownIcon, FilterIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "./SubjectsPage.module.css";


type SortKey = "nombre" | "lecciones" | "creacion";
const SORT_LABELS: Record<SortKey, string> = {
    nombre:    "Alfabéticamente",
    lecciones: "Lecciones",
    creacion:  "Fecha de creación",
};

// â”€â”€â”€ Modal state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ModalState = AsignaturaFormData & { id?: string; semestres?: [Semestre, Semestre] };

const BLANK: AsignaturaFormData = {
    year: new Date().getFullYear(),
    nombre: "",
    grupo: 7,
    seccion: 1,
    lecciones: 30,
};

// â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AsignaturaCard({
    asig, onEdit, onDelete,
}: { asig: Asignatura; onEdit: (a: Asignatura) => void; onDelete: (id: string) => void }) {
    const [confirming, setConfirming] = useState(false);
    return (
        <div className={styles.card}>
            <div className={styles.cardMeta}>
                <span className={styles.yearBadge}>{asig.year}</span>
                <div className={styles.cardActions}>
                    <button className={styles.iconBtn} onClick={() => onEdit(asig)}><EditIcon /></button>
                    <button className={`${styles.iconBtn} ${styles.delete}`} onClick={() => setConfirming(true)}><TrashIcon /></button>
                </div>
            </div>

            <p className={styles.cardName}>{asig.nombre}</p>
            <span className={styles.cardGrupo}><UsersIcon />Grupo {asig.grupo}{asig.seccion > 0 ? ` · Sección ${asig.seccion}` : ""}</span>
            <div className={styles.divider} />
            <span className={styles.cardLecciones}><BookIcon />{asig.lecciones} lecciones</span>

            <div className={styles.semestres}>
                {asig.semestres.map((s) => (
                    <span key={s.id} className={styles.semBadge}>{s.nombre}</span>
                ))}
            </div>

            {confirming && (
                <div className={styles.deleteConfirm}>
                    <span>¿Eliminar asignatura?</span>
                    <button className={styles.confirmYes} onClick={() => onDelete(asig.id)}>Sí</button>
                    <button className={styles.confirmNo} onClick={() => setConfirming(false)}>No</button>
                </div>
            )}
        </div>
    );
}

// â”€â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AsignaturaModal({
    initial, onSave, onClose,
}: { initial: ModalState; onSave: (data: AsignaturaFormData, id?: string, semestres?: [Semestre, Semestre]) => void; onClose: () => void }) {
    const maxLecciones = useConfiguracionStore((s) => s.defaultLecciones);
    const [form, setForm] = useState<AsignaturaFormData>({
        year: new Date().getFullYear(), nombre: initial.nombre, grupo: initial.grupo, seccion: initial.seccion ?? 1, lecciones: initial.lecciones,
    });
    const [leccionesStr, setLeccionesStr] = useState(String(initial.lecciones));
    const [grupoStr,     setGrupoStr]     = useState(String(initial.grupo));
    const [seccionStr,   setSeccionStr]   = useState(String(initial.seccion ?? 1));

    const isEdit = Boolean(initial.id);

    const setNombre = (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, nombre: e.target.value }));

    const makeNumHandlers = (
        key: "lecciones" | "grupo" | "seccion",
        setStr: React.Dispatch<React.SetStateAction<string>>,
    ) => ({
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setStr(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && !isNaN(n)) setForm((f) => ({ ...f, [key]: n }));
        },
        onBlur: (e: React.ChangeEvent<HTMLInputElement>) => {
            const n = Number(e.target.value);
            const val = e.target.value === "" || isNaN(n) || n < 1 ? 1 : n;
            setStr(String(val));
            setForm((f) => ({ ...f, [key]: val }));
        },
    });

    const leccionesH = {
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setLeccionesStr(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && !isNaN(n)) setForm((f) => ({ ...f, lecciones: Math.min(n, maxLecciones) }));
        },
        onBlur: (e: React.ChangeEvent<HTMLInputElement>) => {
            const n = Number(e.target.value);
            const val = e.target.value === "" || isNaN(n) || n < 1 ? 1 : Math.min(n, maxLecciones);
            setLeccionesStr(String(val));
            setForm((f) => ({ ...f, lecciones: val }));
        },
    };
    const grupoH     = makeNumHandlers("grupo",     setGrupoStr);
    const seccionH   = makeNumHandlers("seccion",   setSeccionStr);

    const valid = form.nombre.trim() !== "" && form.grupo > 0 && form.seccion > 0 && form.lecciones > 0;

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="asignatura-form" className={styles.saveBtn} disabled={!valid}>
                {isEdit ? "Guardar cambios" : "Confirmar"}
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar asignatura" : "Nueva asignatura"} footer={footer}>
            <form id="asignatura-form" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }} onSubmit={(e) => { e.preventDefault(); if (valid) onSave(form, initial.id, initial.semestres); }}>
                <div className={styles.row2}>
                    <FormField label="Nombre de la asignatura" required>
                        <input className={styles.formInput} type="text" placeholder="Ej: Matemáticas II" value={form.nombre} onChange={setNombre} autoFocus required />
                    </FormField>
                    <FormField label="# Lecciones" required>
                        <input className={styles.formInput} type="number" value={leccionesStr} min={1} max={maxLecciones} {...leccionesH} required />
                    </FormField>
                </div>
                <div className={styles.row2}>
                    <FormField label="Grupo" required>
                        <input className={styles.formInput} type="number" min={1} max={12} value={grupoStr} {...grupoH} required />
                    </FormField>
                    <FormField label="Sección" required>
                        <input className={styles.formInput} type="number" min={1} placeholder="1" value={seccionStr} {...seccionH} required />
                    </FormField>
                </div>
                {!isEdit && (
                    <div className={styles.semPreview}>
                        <p>Semestres generados automáticamente</p>
                        <div className={styles.semestres}>
                            <span className={styles.semBadge}>Semestre I</span>
                            <span className={styles.semBadge}>Semestre II</span>
                        </div>
                    </div>
                )}
            </form>
        </Modal>
    );
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function SubjectsPage() {
    const { asignaturas, addAsignatura, updateAsignatura, deleteAsignatura } = useAsignaturasStore();
    const institutionId = useInstitutionStore((s) => s.currentId);
    const defaultLecciones = useConfiguracionStore((s) => s.defaultLecciones);
    const [modal, setModal] = useState<ModalState | null>(null);

    const [search,      setSearch]      = useState("");
    const [filterGrupo,   setFilterGrupo]   = useState("");
    const [filterYear,     setFilterYear]     = useState("");
    const [filterSeccion, setFilterSeccion] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("creacion");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);
    const [showSort,    setShowSort]    = useState(false);

    const activeFilterCount = [filterGrupo, filterYear, filterSeccion].filter(Boolean).length;

    const grupos   = useMemo(() => [...new Set(asignaturas.map((a) => a.grupo))].sort((a, b) => a - b), [asignaturas]);
    const years     = useMemo(() => [...new Set(asignaturas.map((a) => a.year))].sort((a, b) => b - a), [asignaturas]);
    const secciones = useMemo(() => [...new Set(asignaturas.map((a) => a.seccion ?? 1))].sort((a, b) => a - b), [asignaturas]);

    const filtered = useMemo(() => {
        let list = asignaturas
            .filter((a) => a.nombre.toLowerCase().includes(search.toLowerCase()) || String(a.grupo).includes(search) || String(a.seccion).includes(search))
            .filter((a) => filterGrupo   ? String(a.grupo)   === filterGrupo   : true)
            .filter((a) => filterYear     ? a.year === Number(filterYear)          : true)
            .filter((a) => filterSeccion ? String(a.seccion) === filterSeccion  : true);
        return [...list].sort((a, b) => {
            const mul = sortDir === "asc" ? 1 : -1;
            if (sortKey === "nombre")    return mul * a.nombre.localeCompare(b.nombre);
            if (sortKey === "lecciones") return mul * (a.lecciones - b.lecciones);
            return mul * a.created_at.localeCompare(b.created_at);
        });
    }, [asignaturas, search, filterGrupo, filterYear, filterSeccion, sortKey, sortDir]);

    const openEdit = (a: Asignatura) =>
        setModal({ id: a.id, year: a.year, nombre: a.nombre, grupo: a.grupo, seccion: a.seccion, lecciones: a.lecciones, semestres: a.semestres });

    const handleSave = (data: AsignaturaFormData, id?: string, semestres?: [Semestre, Semestre]) => {
        if (id && semestres) updateAsignatura(id, data, semestres);
        else                 addAsignatura(institutionId, data);
        setModal(null);
    };

    return (
        <>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2>Asignaturas</h2>
                    <p>
                        {filtered.length !== asignaturas.length
                            ? `${filtered.length} de ${asignaturas.length} asignaturas`
                            : `${asignaturas.length} asignatura${asignaturas.length !== 1 ? "s" : ""} registrada${asignaturas.length !== 1 ? "s" : ""}`}
                    </p>
                </div>
                <button className={styles.addBtn} onClick={() => setModal({ ...BLANK, lecciones: defaultLecciones })}>
                    <PlusIcon /> Nueva asignatura
                </button>
            </div>

            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar asignatura..." width={220} />

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
                                    <label>Sección</label>
                                    <select value={filterSeccion} onChange={(e) => setFilterSeccion(e.target.value)}>
                                        <option value="">Todas</option>
                                        {secciones.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button type="button" className={styles.filterClearBtn}
                                        onClick={() => { setFilterGrupo(""); setFilterYear(""); setFilterSeccion(""); }}>
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
                        className={`${styles.filterToggleBtn}${sortKey !== "creacion" || sortDir !== "desc" ? ` ${styles.filterToggleActive}` : ""}`}
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
                                            <ChevronDownIcon style={{ transform: dir === "asc" ? "rotate(180deg)" : "none", width: 13, height: 13, flexShrink: 0 }} />
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className={styles.grid}>
                {filtered.length === 0 ? (
                    <EmptyState
                        title={asignaturas.length === 0 ? "Sin asignaturas registradas" : "Sin resultados"}
                        subtitle={asignaturas.length === 0 ? 'Haz clic en "Nueva asignatura" para comenzar' : "Intenta con otros filtros"}
                    />
                ) : (
                    filtered.map((a) => (
                        <AsignaturaCard key={a.id} asig={a} onEdit={openEdit} onDelete={deleteAsignatura} />
                    ))
                )}
            </div>

            {modal && (
                <AsignaturaModal initial={modal} onSave={handleSave} onClose={() => setModal(null)} />
            )}
        </>
    );
}

