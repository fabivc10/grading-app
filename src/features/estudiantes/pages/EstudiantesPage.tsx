import { useState, useMemo, FormEvent } from "react";
import { useEstudiantesStore } from "../store";
import { useAsignaturasStore } from "../../asignaturas/store";
import { useInstitutionStore } from "../../institution/store";
import type { Adecuacion, AsigRef, Estudiante, EstudianteFormData } from "../types";
import { PlusIcon, EditIcon, TrashIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "../EstudiantesPage.module.css";

// ─── Adecuación config ────────────────────────────────────────────────────────
const ADE_CONFIG: Record<Adecuacion, { label: string; cls: string }> = {
    acceso:          { label: "Acceso",          cls: styles.adeAcceso },
    significativa:   { label: "Significativa",   cls: styles.adeSignificativa },
    no_significativa:{ label: "No significativa",cls: styles.adeNoSignificativa },
    no_tiene:        { label: "No tiene",        cls: styles.adeNoTiene },
};

const BLANK: EstudianteFormData = {
    nombreCompleto: "", cedula: "", telefono: "",
    edad: 15, adecuacion: "no_tiene", asignaturas: [],
};

// ─── AdeBadge ─────────────────────────────────────────────────────────────────
function AdeBadge({ value }: { value: Adecuacion }) {
    const cfg = ADE_CONFIG[value];
    return <span className={`${styles.adeBadge} ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function EstudianteModal({
    initial,
    asigCatalogue,
    onSave,
    onClose,
}: {
    initial: EstudianteFormData & { id?: string };
    asigCatalogue: AsigRef[];
    onSave: (data: EstudianteFormData, id?: string) => void;
    onClose: () => void;
}) {
    const [form, setForm] = useState<EstudianteFormData>({ ...initial });
    const isEdit = Boolean(initial.id);

    const setField = (key: keyof EstudianteFormData) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [key]: val }));
    };

    const toggleAsig = (asig: AsigRef) => {
        setForm((f) => {
            const has = f.asignaturas.some((a) => a.id === asig.id);
            return {
                ...f,
                asignaturas: has
                    ? f.asignaturas.filter((a) => a.id !== asig.id)
                    : [...f.asignaturas, asig],
            };
        });
    };

    const valid = form.nombreCompleto.trim() !== "" && form.cedula.trim() !== "" && form.edad > 0;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!valid) return;
        onSave(form, initial.id);
    };

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="estudiante-form" className={styles.saveBtn} disabled={!valid}>
                {isEdit ? "Guardar cambios" : "Crear estudiante"}
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title={isEdit ? "Editar estudiante" : "Nuevo estudiante"} footer={footer}>
            <form id="estudiante-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <FormField label="Nombre completo" required>
                    <input className={styles.formInput} type="text" placeholder="Ej: Ana García López" value={form.nombreCompleto} onChange={setField("nombreCompleto")} autoFocus required />
                </FormField>

                <div className={styles.row2}>
                    <FormField label="Cédula" required>
                        <input className={styles.formInput} type="text" placeholder="1-2345-6789" value={form.cedula} onChange={setField("cedula")} required />
                    </FormField>
                    <FormField label="Teléfono">
                        <input className={styles.formInput} type="tel" placeholder="+503 7000-0000" value={form.telefono} onChange={setField("telefono")} />
                    </FormField>
                </div>

                <div className={styles.row2}>
                    <FormField label="Edad" required>
                        <input className={styles.formInput} type="number" min={4} max={30} value={form.edad} onChange={setField("edad")} required />
                    </FormField>
                    <FormField label="Adecuación curricular">
                        <select className={styles.formInput} value={form.adecuacion} onChange={setField("adecuacion")}>
                            <option value="no_tiene">No tiene</option>
                            <option value="acceso">Acceso</option>
                            <option value="significativa">Significativa</option>
                            <option value="no_significativa">No significativa</option>
                        </select>
                    </FormField>
                </div>

                <div>
                    <p className={styles.sectionLabel}>Asignaturas asociadas</p>
                    <div className={styles.asigList}>
                        {asigCatalogue.length === 0 ? (
                            <span className={styles.emptyAsig}>No hay asignaturas disponibles</span>
                        ) : (
                            asigCatalogue.map((asig) => (
                                <label key={asig.id} className={styles.asigOption}>
                                    <input
                                        type="checkbox"
                                        checked={form.asignaturas.some((a) => a.id === asig.id)}
                                        onChange={() => toggleAsig(asig)}
                                    />
                                    <span className={styles.asigOptionLabel}>
                                        <strong>{asig.nombre}</strong>
                                        <span>· {asig.grupo} · {asig.año}</span>
                                    </span>
                                </label>
                            ))
                        )}
                    </div>
                </div>
            </form>
        </Modal>
    );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function EstudianteCard({
    est,
    onEdit,
    onDelete,
}: {
    est: Estudiante;
    onEdit: (e: Estudiante) => void;
    onDelete: (id: string) => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const visible = est.asignaturas.slice(0, 2);
    const extra   = est.asignaturas.length - visible.length;

    return (
        <tr>
            <td className={styles.tdName}>{est.nombreCompleto}</td>
            <td className={styles.tdMono}>{est.cedula}</td>
            <td>{est.telefono}</td>
            <td>{est.edad}</td>
            <td><AdeBadge value={est.adecuacion} /></td>
            <td>
                <div className={styles.asigChips}>
                    {visible.map((a) => (
                        <span key={a.id} className={styles.asigChip} title={`${a.nombre} · ${a.grupo} · ${a.año}`}>
                            {a.nombre}
                        </span>
                    ))}
                    {extra > 0 && <span className={styles.moreChip}>+{extra}</span>}
                    {est.asignaturas.length === 0 && <span style={{ color: "#d1d5db", fontSize: "0.78rem" }}>—</span>}
                </div>
            </td>
            <td>
                {confirming ? (
                    <div className={styles.deleteConfirm}>
                        <span>¿Eliminar?</span>
                        <button className={styles.confirmYes} onClick={() => onDelete(est.id)}>Sí</button>
                        <button className={styles.confirmNo}  onClick={() => setConfirming(false)}>No</button>
                    </div>
                ) : (
                    <div className={styles.actions}>
                        <button className={styles.iconBtn} onClick={() => onEdit(est)} title="Editar"><EditIcon /></button>
                        <button className={`${styles.iconBtn} ${styles.delete}`} onClick={() => setConfirming(true)} title="Eliminar"><TrashIcon /></button>
                    </div>
                )}
            </td>
        </tr>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function EstudiantesPage() {
    const { estudiantes, addEstudiante, updateEstudiante, deleteEstudiante } = useEstudiantesStore();
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const institutionId = useInstitutionStore((s) => s.currentId);
    const asigCatalogue: AsigRef[] = asignaturas.map((a) => ({ id: a.id, nombre: a.nombre, grupo: a.grupo, año: a.año }));

    const [modal, setModal] = useState<(EstudianteFormData & { id?: string }) | null>(null);
    const [search,     setSearch]     = useState("");
    const [filterAde,  setFilterAde]  = useState<Adecuacion | "">("");

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return estudiantes.filter((e) => {
            const matchSearch = !q
                || e.nombreCompleto.toLowerCase().includes(q)
                || e.cedula.includes(q)
                || e.telefono.includes(q);
            const matchAde = !filterAde || e.adecuacion === filterAde;
            return matchSearch && matchAde;
        });
    }, [estudiantes, search, filterAde]);

    const openCreate = () => setModal({ ...BLANK });
    const openEdit   = (e: Estudiante) => setModal({ ...e });

    const handleSave = (data: EstudianteFormData, id?: string) => {
        if (id) {
            updateEstudiante(id, data);
        } else {
            addEstudiante(institutionId, data);
        }
        setModal(null);
    };

    const handleDelete = (id: string) => deleteEstudiante(id);

    const hasFilters = search || filterAde;

    return (
        <>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2>Estudiantes</h2>
                    <p>
                        {filtered.length !== estudiantes.length
                            ? `${filtered.length} de ${estudiantes.length} estudiantes`
                            : `${estudiantes.length} estudiante${estudiantes.length !== 1 ? "s" : ""} registrado${estudiantes.length !== 1 ? "s" : ""}`}
                    </p>
                </div>
                <button className={styles.addBtn} onClick={openCreate}>
                    <PlusIcon /> Nuevo estudiante
                </button>
            </div>

            {/* ── Toolbar ── */}
            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, cédula o teléfono..." width={280} />

                <select
                    className={styles.filterSelect}
                    value={filterAde}
                    onChange={(e) => setFilterAde(e.target.value as Adecuacion | "")}
                >
                    <option value="">Todas las adecuaciones</option>
                    <option value="no_tiene">No tiene</option>
                    <option value="acceso">Acceso</option>
                    <option value="significativa">Significativa</option>
                    <option value="no_significativa">No significativa</option>
                </select>

                {hasFilters && (
                    <button className={styles.clearAll} onClick={() => { setSearch(""); setFilterAde(""); }}>
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* ── Table ── */}
            <div className={styles.tableWrap}>
                <div className={styles.tableScroll}>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre completo</th>
                                <th>Cédula</th>
                                <th>Teléfono</th>
                                <th>Edad</th>
                                <th>Adecuación</th>
                                <th>Asignaturas</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <EmptyState
                                            title={estudiantes.length === 0 ? "Sin estudiantes registrados" : "Sin resultados"}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((e) => (
                                    <EstudianteCard key={e.id} est={e} onEdit={openEdit} onDelete={handleDelete} />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && (
                <EstudianteModal
                    initial={modal}
                    asigCatalogue={asigCatalogue}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}
