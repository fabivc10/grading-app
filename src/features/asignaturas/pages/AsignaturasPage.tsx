import { useState, useMemo } from "react";
import { useAsignaturasStore } from "../store";
import { useInstitutionStore } from "../../institution/store";
import type { Asignatura, Semestre, AsignaturaFormData } from "../types";
import { PlusIcon, EditIcon, TrashIcon, UsersIcon, BookIcon, SortIcon, CheckIcon, FilterIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "../AsignaturasPage.module.css";


const SORT_OPTIONS = [
    { value: "az",       label: "Nombre A→Z" },
    { value: "za",       label: "Nombre Z→A" },
    { value: "lec-desc", label: "Más lecciones" },
    { value: "lec-asc",  label: "Menos lecciones" },
    { value: "año-desc", label: "Año más reciente" },
    { value: "año-asc",  label: "Año más antiguo" },
] as const;

// ─── Modal state ──────────────────────────────────────────────────────────────
type ModalState = AsignaturaFormData & { id?: string; semestres?: [Semestre, Semestre] };

const BLANK: AsignaturaFormData = {
    año: new Date().getFullYear(),
    nombre: "",
    grupo: 7,
    seccion: 1,
    lecciones: 30,
};

// ─── Card ─────────────────────────────────────────────────────────────────────
function AsignaturaCard({
    asig, onEdit, onDelete,
}: { asig: Asignatura; onEdit: (a: Asignatura) => void; onDelete: (id: string) => void }) {
    const [confirming, setConfirming] = useState(false);
    return (
        <div className={styles.card}>
            <div className={styles.cardMeta}>
                <span className={styles.yearBadge}>{asig.año}</span>
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

// ─── Modal ────────────────────────────────────────────────────────────────────
function AsignaturaModal({
    initial, onSave, onClose,
}: { initial: ModalState; onSave: (data: AsignaturaFormData, id?: string, semestres?: [Semestre, Semestre]) => void; onClose: () => void }) {
    const [form, setForm] = useState<AsignaturaFormData>({
        año: initial.año, nombre: initial.nombre, grupo: initial.grupo, seccion: initial.seccion ?? 1, lecciones: initial.lecciones,
    });
    const isEdit = Boolean(initial.id);
    const set = (key: keyof AsignaturaFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [key]: v }));
    };
    const valid = form.nombre.trim() !== "" && form.grupo > 0 && form.seccion > 0 && form.lecciones > 0;

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="asignatura-form" className={styles.saveBtn} disabled={!valid}>
                {isEdit ? "Guardar cambios" : "Crear asignatura"}
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar asignatura" : "Nueva asignatura"} footer={footer}>
            <form id="asignatura-form" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }} onSubmit={(e) => { e.preventDefault(); if (valid) onSave(form, initial.id, initial.semestres); }}>
                <div className={styles.row2}>
                    <FormField label="Año" required>
                        <input className={styles.formInput} type="number" value={form.año} onChange={set("año")} min={2000} max={2100} required />
                    </FormField>
                    <FormField label="# Lecciones" required>
                        <input className={styles.formInput} type="number" value={form.lecciones} onChange={set("lecciones")} min={1} max={500} required />
                    </FormField>
                </div>
                <FormField label="Nombre de la asignatura" required>
                    <input className={styles.formInput} type="text" placeholder="Ej: Matemáticas II" value={form.nombre} onChange={set("nombre")} autoFocus required />
                </FormField>
                <div className={styles.row2}>
                    <FormField label="Grupo" required>
                        <input className={styles.formInput} type="number" min={1} max={12} value={form.grupo} onChange={set("grupo")} required />
                    </FormField>
                    <FormField label="Sección" required>
                        <input className={styles.formInput} type="number" min={1} placeholder="1" value={form.seccion} onChange={set("seccion")} required />
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export function AsignaturasPage() {
    const { asignaturas, addAsignatura, updateAsignatura, deleteAsignatura } = useAsignaturasStore();
    const institutionId = useInstitutionStore((s) => s.currentId);
    const [modal, setModal] = useState<ModalState | null>(null);

    const [search,      setSearch]      = useState("");
    const [filterGrupo, setFilterGrupo] = useState("");
    const [filterAño,   setFilterAño]   = useState("");
    const [sort,        setSort]        = useState<typeof SORT_OPTIONS[number]["value"]>("az");
    const [showFilters, setShowFilters] = useState(false);
    const [showSort,    setShowSort]    = useState(false);

    const activeFilterCount = [filterGrupo, filterAño].filter(Boolean).length;

    const grupos = useMemo(() => [...new Set(asignaturas.map((a) => a.grupo))].sort((a, b) => a - b), [asignaturas]);
    const años   = useMemo(() => [...new Set(asignaturas.map((a) => a.año))].sort((a, b) => b - a), [asignaturas]);

    const filtered = useMemo(() => {
        let list = asignaturas
            .filter((a) => a.nombre.toLowerCase().includes(search.toLowerCase()) || String(a.grupo).includes(search))
            .filter((a) => filterGrupo ? String(a.grupo) === filterGrupo : true)
            .filter((a) => filterAño   ? a.año === Number(filterAño) : true);
        return [...list].sort((a, b) => {
            if (sort === "az")       return a.nombre.localeCompare(b.nombre);
            if (sort === "za")       return b.nombre.localeCompare(a.nombre);
            if (sort === "lec-desc") return b.lecciones - a.lecciones;
            if (sort === "lec-asc")  return a.lecciones - b.lecciones;
            if (sort === "año-desc") return b.año - a.año;
            return a.año - b.año;
        });
    }, [asignaturas, search, filterGrupo, filterAño, sort]);

    const openEdit = (a: Asignatura) =>
        setModal({ id: a.id, año: a.año, nombre: a.nombre, grupo: a.grupo, seccion: a.seccion, lecciones: a.lecciones, semestres: a.semestres });

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
                <button className={styles.addBtn} onClick={() => setModal({ ...BLANK })}>
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
                                    <label>Año</label>
                                    <select value={filterAño} onChange={(e) => setFilterAño(e.target.value)}>
                                        <option value="">Todos</option>
                                        {años.map((y) => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Grupo</label>
                                    <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)}>
                                        <option value="">Todos</option>
                                        {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button type="button" className={styles.filterClearBtn}
                                        onClick={() => { setFilterGrupo(""); setFilterAño(""); }}>
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
                        className={`${styles.filterToggleBtn}${sort !== "az" ? ` ${styles.filterToggleActive}` : ""}`}
                        onClick={() => { setShowSort(v => !v); setShowFilters(false); }}>
                        <SortIcon /> {SORT_OPTIONS.find(o => o.value === sort)?.label ?? "Ordenar"}
                    </button>
                    {showSort && (
                        <>
                            <div className={styles.filterBackdrop} onClick={() => setShowSort(false)} />
                            <div className={styles.filterPopover}>
                                {SORT_OPTIONS.map((o) => (
                                    <button key={o.value} type="button"
                                        className={`${styles.sortOption}${sort === o.value ? ` ${styles.sortOptionActive}` : ""}`}
                                        onClick={() => { setSort(o.value); setShowSort(false); }}>
                                        {o.label}
                                        {sort === o.value && <CheckIcon className={styles.sortCheckIcon} />}
                                    </button>
                                ))}
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
