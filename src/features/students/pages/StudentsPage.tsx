import { useState, useMemo, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useEstudiantesStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { useInstitutionStore } from "../../institution/store";
import type { Adecuacion, AsigRef, Estudiante, EstudianteFormData, Tutor } from "../types";
import { PlusIcon, EditIcon, TrashIcon, FilterIcon, SortIcon, ChevronDownIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "./StudentsPage.module.css";

// â”€â”€â”€ AdecuaciÃ³n config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ADE_CONFIG: Record<Adecuacion, { label: string; cls: string }> = {
    acceso:          { label: "Acceso",          cls: styles.adeAcceso },
    significativa:   { label: "Significativa",   cls: styles.adeSignificativa },
    no_significativa:{ label: "No significativa",cls: styles.adeNoSignificativa },
    no_tiene:        { label: "No tiene",        cls: styles.adeNoTiene },
};

const BLANK_TUTOR: Tutor = { nombre: "", telefono: "" };

const BLANK: EstudianteFormData = {
    nombreCompleto: "", cedula: "",
    fechaNacimiento: "", telefonoEstudiante: "",
    tutores: [{ ...BLANK_TUTOR }],
    adecuacion: "no_tiene", asignaturas: [],
};

function calcAge(fechaNacimiento: string): number | null {
    if (!fechaNacimiento) return null;
    const today = new Date();
    const birth = new Date(fechaNacimiento);
    if (isNaN(birth.getTime())) return null;
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

// "2009-05-23" â†’ "23/05/2009"
function isoToDisplay(iso: string): string {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

// "23/05/2009" â†’ "2009-05-23" (returns "" if incomplete)
function displayToIso(text: string): string {
    const parts = text.split("/");
    if (parts.length !== 3) return "";
    const [d, m, y] = parts;
    if (d.length !== 2 || m.length !== 2 || y.length !== 4) return "";
    return `${y}-${m}-${d}`;
}

// Auto-insert slashes as user types dd/mm/yyyy
function formatDateInput(_prev: string, next: string): string {
    const digits = next.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 2) out = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) out = out.slice(0, 5) + "/" + digits.slice(4);
    return out;
}

// Validate that an ISO date string is a real past date
function isValidBirthDate(iso: string): boolean {
    if (!iso) return true; // optional
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today && d.getFullYear() >= 1900;
}

// Format cedula as X-XXXX-XXXX (9 digits, Costa Rica national ID)
function formatCedula(next: string): string {
    const digits = next.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 1) return digits;
    if (digits.length <= 5) return digits.slice(0, 1) + "-" + digits.slice(1);
    return digits.slice(0, 1) + "-" + digits.slice(1, 5) + "-" + digits.slice(5);
}

// Allow only phone-valid characters: digits, +, spaces, -, (, )
function isValidPhone(p: string): boolean {
    return !p || /^[+\d\s\-()\.\,]+$/.test(p.trim());
}

// â”€â”€â”€ AdeBadge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AdeBadge({ value }: { value: Adecuacion }) {
    if (value === "no_tiene") return null;
    const cfg = ADE_CONFIG[value];
    return <span className={`${styles.adeBadge} ${cfg.cls}`}>{cfg.label}</span>;
}

// â”€â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EstudianteModal({
    initial,
    asigCatalogue,
    onSave,
    onClose,
}: {
    initial: EstudianteFormData & { id?: string };
    asigCatalogue: AsigRef[];
    onSave: (data: EstudianteFormData, id?: string) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState<EstudianteFormData>({
        ...initial,
        tutores: initial.tutores.length > 0 ? initial.tutores.map((t) => ({ ...t })) : [{ ...BLANK_TUTOR }],
    });
    const [dateText, setDateText] = useState(() => isoToDisplay(initial.fechaNacimiento));
    const isEdit = Boolean(initial.id);

    const setField = (key: "nombreCompleto" | "telefonoEstudiante" | "adecuacion") => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setForm((f) => ({ ...f, [key]: e.target.value }));
    };

    const handleCedulaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((f) => ({ ...f, cedula: formatCedula(e.target.value) }));
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatDateInput(dateText, e.target.value);
        setDateText(formatted);
        setForm((f) => ({ ...f, fechaNacimiento: displayToIso(formatted) }));
    };

    const setTutor = (idx: number, key: keyof Tutor, value: string) =>
        setForm((f) => {
            const tutores = [...f.tutores];
            tutores[idx] = { ...tutores[idx], [key]: value };
            return { ...f, tutores };
        });

    const addTutor    = () => setForm((f) => ({ ...f, tutores: [...f.tutores, { ...BLANK_TUTOR }] }));
    const removeTutor = () => setForm((f) => ({ ...f, tutores: f.tutores.slice(0, 1) }));

    const previewAge = calcAge(form.fechaNacimiento);

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

    const dateOk  = isValidBirthDate(form.fechaNacimiento);
    const phoneOk = isValidPhone(form.telefonoEstudiante)
        && form.tutores.every((t) => isValidPhone(t.telefono));
    const valid = form.nombreCompleto.trim() !== ""
        && form.cedula.trim() !== ""
        && dateOk && phoneOk;

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            await onSave(form, initial.id);
        } catch (err) {
            setSaveError(String(err));
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const footer = (
        <>
            {saveError && <span style={{ fontSize: "0.78rem", color: "var(--danger, #ef4444)", flex: 1 }}>{saveError}</span>}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" form="estudiante-form" className={styles.saveBtn} disabled={!valid || saving}>
                {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Confirmar"}
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
                        <input className={styles.formInput} type="text" placeholder="1-2345-6789" value={form.cedula} onChange={handleCedulaChange} maxLength={11} required />
                    </FormField>
                    <FormField label={`Fecha de nacimiento${previewAge !== null ? ` · ${previewAge} years` : ""}${form.fechaNacimiento && !dateOk ? " · fecha inválida" : ""}`}>
                        <input className={`${styles.formInput}${form.fechaNacimiento && !dateOk ? ` ${styles.inputError}` : ""}`} type="text" placeholder="dd/mm/aaaa" value={dateText} onChange={handleDateChange} maxLength={10} />
                    </FormField>
                </div>

                <div className={styles.row2}>
                    <FormField label="Adecuación curricular">
                        <select className={styles.formInput} value={form.adecuacion} onChange={setField("adecuacion")}>
                            <option value="no_tiene">No tiene</option>
                            <option value="acceso">Acceso</option>
                            <option value="significativa">Significativa</option>
                            <option value="no_significativa">No significativa</option>
                        </select>
                    </FormField>
                    <FormField label="Teléfono del estudiante (si aplica)">
                        <input className={`${styles.formInput}${form.telefonoEstudiante && !isValidPhone(form.telefonoEstudiante) ? ` ${styles.inputError}` : ""}`} type="tel" placeholder="+506 0000-0000" value={form.telefonoEstudiante} onChange={setField("telefonoEstudiante")} />
                    </FormField>
                </div>

                {/* â”€â”€ Tutores â”€â”€ */}
                <div className={styles.tutoresSection}>
                    <p className={styles.sectionLabel}>Tutor legal / Contacto de emergencia (opcional)</p>

                    {/* Tutor 1 â€” opcional */}
                    <div className={styles.tutorRow}>
                        <FormField label="Nombre del tutor">
                            <input className={styles.formInput} type="text" placeholder="Ej: María López" value={form.tutores[0].nombre} onChange={(e) => setTutor(0, "nombre", e.target.value)} />
                        </FormField>
                        <FormField label="Teléfono">
                            <input className={`${styles.formInput}${form.tutores[0].telefono && !isValidPhone(form.tutores[0].telefono) ? ` ${styles.inputError}` : ""}`} type="tel" placeholder="+506 0000-0000" value={form.tutores[0].telefono} onChange={(e) => setTutor(0, "telefono", e.target.value)} />
                        </FormField>
                    </div>

                    {/* Tutor 2 â€” opcional */}
                    {form.tutores.length >= 2 ? (
                        <div className={styles.tutorRow}>
                            <FormField label="Nombre del 2° contacto">
                                <input className={styles.formInput} type="text" placeholder="Ej: Carlos López" value={form.tutores[1].nombre} onChange={(e) => setTutor(1, "nombre", e.target.value)} />
                            </FormField>
                            <FormField label="Teléfono">
                                <input className={`${styles.formInput}${form.tutores[1].telefono && !isValidPhone(form.tutores[1].telefono) ? ` ${styles.inputError}` : ""}`} type="tel" placeholder="+506 0000-0000" value={form.tutores[1].telefono} onChange={(e) => setTutor(1, "telefono", e.target.value)} />
                            </FormField>
                            <button type="button" className={styles.removeTutorBtn} onClick={removeTutor} title="Eliminar 2° contacto">×</button>
                        </div>
                    ) : (
                        <button type="button" className={styles.addTutorBtn} onClick={addTutor}>
                            + Agregar 2° contacto de emergencia
                        </button>
                    )}
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
                                        <span>· {asig.grupo}-{asig.seccion} · {asig.year}</span>
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

// â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <td>{calcAge(est.fechaNacimiento) ?? "-"}</td>
            <td>
                {est.tutores[0] ? (
                    <span title={est.tutores[0].nombre}>
                        {est.tutores[0].telefono || est.tutores[0].nombre || "-"}
                    </span>
                ) : "-"}
            </td>
            <td><AdeBadge value={est.adecuacion} /></td>
            <td>
                <div className={styles.asigChips}>
                    {visible.map((a) => (
                        <span key={a.id} className={styles.asigChip} title={`${a.nombre} · Grupo ${a.grupo}-${a.seccion} · ${a.year}`}>
                            {a.nombre} {a.grupo}-{a.seccion}
                        </span>
                    ))}
                    {extra > 0 && <span className={styles.moreChip}>+{extra}</span>}
                    {est.asignaturas.length === 0 && <span style={{ color: "#d1d5db", fontSize: "0.78rem" }}>-</span>}
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

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function StudentsPage() {
    const { estudiantes, addEstudiante, updateEstudiante, deleteEstudiante } = useEstudiantesStore();
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const institutionId = useInstitutionStore((s) => s.currentId);
    const asigCatalogue: AsigRef[] = asignaturas.map((a) => ({ id: a.id, nombre: a.nombre, grupo: Math.trunc(a.grupo), seccion: Math.trunc(a.seccion), year: a.year }));

    const [modal, setModal] = useState<(EstudianteFormData & { id?: string }) | null>(null);
    const [searchParams] = useSearchParams();
    const [search,       setSearch]      = useState(searchParams.get("q") ?? "");
    const [filterAde,    setFilterAde]   = useState<Adecuacion | "">("");
    const [filterAsig,   setFilterAsig]  = useState("");
    const [filterGrupo,  setFilterGrupo] = useState("");
    const [filterSeccion,setFilterSeccion] = useState("");
    const [showFilters,  setShowFilters] = useState(false);
    const [showSort,     setShowSort]    = useState(false);
    const [sortKey,  setSortKey]  = useState<"nombre" | "edad" | "adecuacion">("nombre");
    const [sortDir,  setSortDir]  = useState<"asc" | "desc">("asc");

    const grupos   = useMemo(() => [...new Set(asignaturas.map((a) => String(Math.trunc(a.grupo))))].sort((a, b) => Number(a) - Number(b)), [asignaturas]);
    const secciones = useMemo(() => [...new Set(asignaturas.map((a) => String(Math.trunc(a.seccion))))].sort((a, b) => Number(a) - Number(b)), [asignaturas]);

    const activeFilterCount = [filterAde, filterAsig, filterGrupo, filterSeccion].filter(Boolean).length;

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        const list = estudiantes.filter((e) => {
            const matchSearch = !q || e.nombreCompleto.toLowerCase().includes(q) || e.cedula.includes(q);
            const matchAde    = !filterAde    || e.adecuacion === filterAde;
            const matchAsig   = !filterAsig   || e.asignaturas.some((a) => a.id === filterAsig);
            const matchGrupo  = !filterGrupo  || e.asignaturas.some((a) => String(a.grupo) === filterGrupo);
            const matchSec    = !filterSeccion|| e.asignaturas.some((a) => String(a.seccion) === filterSeccion);
            return matchSearch && matchAde && matchAsig && matchGrupo && matchSec;
        });
        return [...list].sort((a, b) => {
            const mul = sortDir === "asc" ? 1 : -1;
            if (sortKey === "nombre") return mul * a.nombreCompleto.localeCompare(b.nombreCompleto);
            if (sortKey === "edad")   return mul * ((calcAge(a.fechaNacimiento) ?? 0) - (calcAge(b.fechaNacimiento) ?? 0));
            return mul * a.adecuacion.localeCompare(b.adecuacion);
        });
    }, [estudiantes, search, filterAde, filterAsig, filterGrupo, filterSeccion, sortKey, sortDir]);

    const SORT_LABELS: Record<"nombre" | "edad" | "adecuacion", string> = {
        nombre:    "Alfabéticamente",
        edad:      "Edad",
        adecuacion:"Adecuación",
    };

    const openCreate = () => setModal({ ...BLANK });
    const openEdit   = (e: Estudiante) => setModal({ ...e });

    const handleSave = async (data: EstudianteFormData, id?: string) => {
        if (id) {
            await updateEstudiante(id, data);
        } else {
            await addEstudiante(institutionId, data);
        }
        setModal(null);
    };

    const handleDelete = (id: string) => deleteEstudiante(id);

    const clearFilters = () => { setFilterAde(""); setFilterAsig(""); setFilterGrupo(""); setFilterSeccion(""); };

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

            {/* â”€â”€ Toolbar â”€â”€ */}
            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o cédula..." width={240} />

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
                                    <label>Adecuación</label>
                                    <select value={filterAde} onChange={(e) => setFilterAde(e.target.value as Adecuacion | "")}>
                                        <option value="">Todas</option>
                                        <option value="acceso">Acceso</option>
                                        <option value="significativa">Significativa</option>
                                        <option value="no_significativa">No significativa</option>
                                        <option value="no_tiene">Sin adecuación</option>
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Asignatura</label>
                                    <select value={filterAsig} onChange={(e) => setFilterAsig(e.target.value)}>
                                        <option value="">Todas</option>
                                        {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.grupo}</option>)}
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
                                    <button type="button" className={styles.filterClearBtn} onClick={clearFilters}>
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
                                {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => {
                                    const active = sortKey === key;
                                    const dir = active ? sortDir : "asc";
                                    return (
                                        <button key={key} type="button"
                                            className={`${styles.sortOption}${active ? ` ${styles.sortOptionActive}` : ""}`}
                                            onClick={() => { if (active) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } }}>
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

            {/* â”€â”€ Table â”€â”€ */}
            <div className={styles.tableWrap}>
                <div className={styles.tableScroll}>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre completo</th>
                                <th>Cédula</th>
                                <th>Edad</th>
                                <th>Tutor / Contacto</th>
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

