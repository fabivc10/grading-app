import { useState, useMemo } from "react";
import { useAsignaturasStore } from "../store";
import { useInstitutionStore } from "../../institution/store";
import type { Asignatura, Semestre, AsignaturaFormData } from "../types";
import { PlusIcon, EditIcon, TrashIcon, CloseIcon, UsersIcon, BookIcon, EmptyIcon, SearchIcon, SortIcon } from "../../../shared/ui/icons";
import styles from "../AsignaturasPage.module.css";

// ─── Modal state ──────────────────────────────────────────────────────────────
type ModalState = AsignaturaFormData & { id?: string; semestres?: [Semestre, Semestre] };

const BLANK: AsignaturaFormData = {
    año: new Date().getFullYear(),
    nombre: "",
    grupo: "7",
    seccion: "A",
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
            <span className={styles.cardGrupo}><UsersIcon />Grupo {asig.grupo}{asig.seccion ? ` · Sección ${asig.seccion}` : ""}</span>
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
        año: initial.año, nombre: initial.nombre, grupo: initial.grupo, seccion: initial.seccion ?? "A", lecciones: initial.lecciones,
    });
    const isEdit = Boolean(initial.id);
    const set = (key: keyof AsignaturaFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [key]: v }));
    };
    const valid = form.nombre.trim() !== "" && form.grupo.trim() !== "" && form.seccion.trim() !== "" && form.lecciones > 0;

    return (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.modal}>
                <div className={styles.modalHeader}>
                    <span className={styles.modalTitle}>{isEdit ? "Editar asignatura" : "Nueva asignatura"}</span>
                    <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (valid) onSave(form, initial.id, initial.semestres); }}>
                    <div className={styles.modalBody}>
                        <div className={styles.row2}>
                            <div className={styles.field}>
                                <label>Año</label>
                                <input type="number" value={form.año} onChange={set("año")} min={2000} max={2100} required />
                            </div>
                            <div className={styles.field}>
                                <label># Lecciones</label>
                                <input type="number" value={form.lecciones} onChange={set("lecciones")} min={1} max={500} required />
                            </div>
                        </div>
                        <div className={styles.field}>
                            <label>Nombre de la asignatura</label>
                            <input type="text" placeholder="Ej: Matemáticas II" value={form.nombre} onChange={set("nombre")} autoFocus required />
                        </div>
                        <div className={styles.row2}>
                            <div className={styles.field}>
                                <label>Grupo</label>
                                <select value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} required>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                                        <option key={n} value={String(n)}>{n}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.field}>
                                <label>Sección</label>
                                <input type="text" placeholder="Ej: A" value={form.seccion} onChange={set("seccion")} required />
                            </div>
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
                    </div>
                    <div className={styles.modalFooter}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
                        <button type="submit" className={styles.saveBtn} disabled={!valid}>
                            {isEdit ? "Guardar cambios" : "Crear asignatura"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
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
    const [sort, setSort] = useState<"az"|"za"|"lec-desc"|"lec-asc"|"año-desc"|"año-asc">("az");

    const grupos = useMemo(() => [...new Set(asignaturas.map((a) => a.grupo))].sort(), [asignaturas]);
    const años   = useMemo(() => [...new Set(asignaturas.map((a) => a.año))].sort((a, b) => b - a), [asignaturas]);

    const filtered = useMemo(() => {
        let list = asignaturas
            .filter((a) => a.nombre.toLowerCase().includes(search.toLowerCase()) || a.grupo.toLowerCase().includes(search.toLowerCase()))
            .filter((a) => filterGrupo ? a.grupo === filterGrupo : true)
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

    const hasFilters = search || filterGrupo || filterAño;

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
                <div className={styles.searchWrap}>
                    <span className={styles.searchIcon}><SearchIcon /></span>
                    <input className={styles.searchInput} type="text" placeholder="Buscar por nombre o grupo..."
                        value={search} onChange={(e) => setSearch(e.target.value)} />
                    {search && <button className={styles.clearSearch} onClick={() => setSearch("")}>×</button>}
                </div>
                <select className={styles.filterSelect} value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)}>
                    <option value="">Todos los grupos</option>
                    {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select className={styles.filterSelect} value={filterAño} onChange={(e) => setFilterAño(e.target.value)}>
                    <option value="">Todos los años</option>
                    {años.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className={styles.sortWrap}>
                    <span className={styles.sortIcon}><SortIcon /></span>
                    <select className={styles.filterSelect} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                        <option value="az">Nombre A→Z</option>
                        <option value="za">Nombre Z→A</option>
                        <option value="lec-desc">Más lecciones</option>
                        <option value="lec-asc">Menos lecciones</option>
                        <option value="año-desc">Año más reciente</option>
                        <option value="año-asc">Año más antiguo</option>
                    </select>
                </div>
                {hasFilters && (
                    <button className={styles.clearAll} onClick={() => { setSearch(""); setFilterGrupo(""); setFilterAño(""); }}>
                        Limpiar filtros
                    </button>
                )}
            </div>

            <div className={styles.grid}>
                {filtered.length === 0 ? (
                    <div className={styles.empty}>
                        <EmptyIcon />
                        <p>{asignaturas.length === 0 ? "Sin asignaturas registradas" : "Sin resultados"}</p>
                        <span>{asignaturas.length === 0 ? 'Haz clic en "Nueva asignatura" para comenzar' : "Intenta con otros filtros"}</span>
                    </div>
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
