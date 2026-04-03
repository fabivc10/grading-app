import { useEffect, useRef, useState, useMemo, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSearchParams } from "react-router-dom";
import { useEstudiantesStore } from "../store";
import { useAsignaturasStore } from "../../subjects/store";
import { useInstitutionStore } from "../../institution/store";
import { useConfiguracionStore } from "../../settings/store";
import type { Adecuacion, AsigRef, Estudiante, EstudianteFormData, ImportedStudentRow, Tutor } from "../types";
import { PlusIcon, EditIcon, TrashIcon, FilterIcon, SortIcon, ChevronDownIcon } from "../../../shared/ui/icons";
import { SearchInput } from "../../../shared/ui/SearchInput";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormField } from "../../../shared/ui/FormField";
import styles from "./StudentsPage.module.css";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ AdecuaciÃƒÂ³n config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const ADE_CONFIG: Record<Adecuacion, { label: string; cls: string }> = {
    acceso:          { label: "Acceso",          cls: styles.adeAcceso },
    significativa:   { label: "Significativa",   cls: styles.adeSignificativa },
    no_significativa:{ label: "No significativa",cls: styles.adeNoSignificativa },
    no_tiene:        { label: "No tiene",        cls: styles.adeNoTiene },
};

const BLANK_TUTOR: Tutor = { nombre: "", telefono: "" };

const BLANK: EstudianteFormData = {
    nombreCompleto: "", cedula: "",
    fechaNacimiento: "",
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

// "2009-05-23" Ã¢â€ â€™ "23/05/2009"
function isoToDisplay(iso: string): string {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

// "23/05/2009" Ã¢â€ â€™ "2009-05-23" (returns "" if incomplete)
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

function normalizeSearchText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function formatEightDigitPhone(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return "";
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function isValidPhone(p: string): boolean {
    return !p.trim() || p.replace(/\D/g, "").length === 8;
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const withMessage = error as { message?: unknown; error?: unknown };
        if (typeof withMessage.message === "string") return withMessage.message;
        if (typeof withMessage.error === "string") return withMessage.error;
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
    return "No se pudo completar la operacion.";
}

async function parseExcelFile(file: File): Promise<ImportedStudentRow[]> {
    console.log("[students/import] Leyendo archivo", {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
    });

    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
    });

    try {
        const rows = await invoke<ImportedStudentRow[]>("parse_students_excel", {
            dataUrl,
            filename: file.name,
        });
        console.log("[students/import] Filas parseadas", {
            count: rows.length,
            preview: rows.slice(0, 5),
        });
        return rows;
    } catch (error) {
        console.error("[students/import] Fallo al parsear Excel", error);
        throw error;
    }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ AdeBadge Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function AdeBadge({ value }: { value: Adecuacion }) {
    if (value === "no_tiene") return null;
    const cfg = ADE_CONFIG[value];
    return <span className={`${styles.adeBadge} ${cfg.cls}`}>{cfg.label}</span>;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

    const setField = (key: "nombreCompleto" | "adecuacion") => (
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
    const valid = form.nombreCompleto.trim() !== ""
        && form.cedula.trim() !== ""
        && dateOk;

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            await onSave({
                ...form,
                nombreCompleto: form.nombreCompleto.normalize("NFC"),
                tutores: form.tutores.map((tutor) => ({
                    ...tutor,
                    nombre: tutor.nombre.normalize("NFC"),
                    telefono: formatEightDigitPhone(tutor.telefono),
                })),
            }, initial.id);
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
                    <input className={styles.formInput} type="text" placeholder={"Ej: Ana Garc\u00eda L\u00f3pez"} value={form.nombreCompleto} onChange={setField("nombreCompleto")} autoFocus required />
                </FormField>

                <div className={styles.row2}>
                    <FormField label={"C\u00e9dula"} required>
                        <input className={styles.formInput} type="text" placeholder="1-2345-6789" value={form.cedula} onChange={handleCedulaChange} maxLength={11} required />
                    </FormField>
                    <FormField label={`Fecha de nacimiento${previewAge !== null ? ` \u00b7 ${previewAge} years` : ""}${form.fechaNacimiento && !dateOk ? " \u00b7 fecha inv\u00e1lida" : ""}`}>
                        <input className={`${styles.formInput}${form.fechaNacimiento && !dateOk ? ` ${styles.inputError}` : ""}`} type="text" placeholder="dd/mm/aaaa" value={dateText} onChange={handleDateChange} maxLength={10} />
                    </FormField>
                </div>

                <FormField label={"Adecuaci\u00f3n curricular"}>
                    <select className={styles.formInput} value={form.adecuacion} onChange={setField("adecuacion")}>
                        <option value="no_tiene">No tiene</option>
                        <option value="acceso">Acceso</option>
                        <option value="significativa">Significativa</option>
                        <option value="no_significativa">No significativa</option>
                    </select>
                </FormField>

                {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tutores Ã¢â€â‚¬Ã¢â€â‚¬ */}
                <div className={styles.tutoresSection}>
                    <p className={styles.sectionLabel}>Tutor legal / Contacto de emergencia (opcional)</p>

                    {/* Tutor 1 Ã¢â‚¬â€ opcional */}
                    <div className={styles.tutorRow}>
                        <FormField label="Nombre del tutor">
                            <input className={styles.formInput} type="text" placeholder={"Ej: Mar\u00eda L\u00f3pez"} value={form.tutores[0].nombre} onChange={(e) => setTutor(0, "nombre", e.target.value)} />
                        </FormField>
                        <FormField label={"Tel\u00e9fono"}>
                            <input className={`${styles.formInput}${form.tutores[0].telefono && !isValidPhone(form.tutores[0].telefono) ? ` ${styles.inputError}` : ""}`} type="tel" placeholder="+506 0000-0000" value={form.tutores[0].telefono} onChange={(e) => setTutor(0, "telefono", e.target.value)} />
                        </FormField>
                    </div>

                    {/* Tutor 2 Ã¢â‚¬â€ opcional */}
                    {form.tutores.length >= 2 ? (
                        <div className={styles.tutorRow}>
                            <FormField label={"Nombre del 2\u00b0 contacto"}>
                                <input className={styles.formInput} type="text" placeholder={"Ej: Carlos L\u00f3pez"} value={form.tutores[1].nombre} onChange={(e) => setTutor(1, "nombre", e.target.value)} />
                            </FormField>
                            <FormField label={"Tel\u00e9fono"}>
                                <input className={`${styles.formInput}${form.tutores[1].telefono && !isValidPhone(form.tutores[1].telefono) ? ` ${styles.inputError}` : ""}`} type="tel" placeholder="+506 0000-0000" value={form.tutores[1].telefono} onChange={(e) => setTutor(1, "telefono", e.target.value)} />
                            </FormField>
                            <button type="button" className={styles.removeTutorBtn} onClick={removeTutor} title={"Eliminar 2\u00b0 contacto"}>{"\u00d7"}</button>
                        </div>
                    ) : (
                        <button type="button" className={styles.addTutorBtn} onClick={addTutor}>
                            + Agregar 2\u00b0 contacto de emergencia
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
                                        <span>{` \u00b7 ${asig.grupo}-${asig.seccion} \u00b7 ${asig.year}`}</span>
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Card Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function BulkAssignModal({
    selectedCount,
    asignaturas,
    onSave,
    onClose,
}: {
    selectedCount: number;
    asignaturas: AsigRef[];
    onSave: (asignaturaId: string) => Promise<void>;
    onClose: () => void;
}) {
    const [asignaturaId, setAsignaturaId] = useState("");
    const [saving, setSaving] = useState(false);

    const footer = (
        <>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button
                type="button"
                className={styles.saveBtn}
                disabled={!asignaturaId || saving}
                onClick={async () => {
                    if (!asignaturaId || saving) return;
                    setSaving(true);
                    try {
                        await onSave(asignaturaId);
                    } finally {
                        setSaving(false);
                    }
                }}
            >
                {saving ? "Guardando..." : "A\u00f1adir asignatura"}
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title="Asignar asignatura" footer={footer}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <p className={styles.sectionLabel}>
                    {"Se a\u00f1adir\u00e1 una asignatura a "}{selectedCount}{" estudiante"}{selectedCount !== 1 ? "s" : ""}{"."}
                </p>
                <FormField label="Asignatura" required>
                    <select
                        className={styles.formInput}
                        value={asignaturaId}
                        onChange={(e) => setAsignaturaId(e.target.value)}
                    >
                        <option value="">Selecciona una asignatura</option>
                        {asignaturas.map((asig) => (
                            <option key={asig.id} value={asig.id}>
                                {`${asig.nombre} \u00b7 ${asig.grupo}-${asig.seccion}`}
                            </option>
                        ))}
                    </select>
                </FormField>
            </div>
        </Modal>
    );
}

function EstudianteCard({
    est,
    selected,
    onEdit,
    onDelete,
    onToggleSelect,
}: {
    est: Estudiante;
    selected: boolean;
    onEdit: (e: Estudiante) => void;
    onDelete: (id: string) => void;
    onToggleSelect: (id: string) => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const visible = est.asignaturas.slice(0, 2);
    const extra   = est.asignaturas.length - visible.length;
    const tutorPhone = formatEightDigitPhone(est.tutores[0]?.telefono ?? "");

    return (
        <tr>
            <td className={styles.tdCheck}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(est.id)}
                    aria-label={`Seleccionar a ${est.nombreCompleto}`}
                />
            </td>
            <td className={styles.tdName}>{est.nombreCompleto}</td>
            <td className={styles.tdMono}>{est.cedula}</td>
            <td>{calcAge(est.fechaNacimiento) ?? "-"}</td>
            <td>{tutorPhone}</td>
            <td><AdeBadge value={est.adecuacion} /></td>
            <td>
                <div className={styles.asigChips}>
                    {visible.map((a) => (
                        <span key={a.id} className={styles.asigChip} title={`${a.nombre} \u00b7 Grupo ${a.grupo}-${a.seccion} \u00b7 ${a.year}`}>
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
                        <span>{"\u00bfEliminar?"}</span>
                        <button className={styles.confirmYes} onClick={() => onDelete(est.id)}>{"S\u00ed"}</button>
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Page Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export function StudentsPage() {
    const {
        estudiantes,
        addEstudiante,
        updateEstudiante,
        deleteEstudiante,
        deleteEstudiantes,
        assignAsignaturaToEstudiantes,
        importEstudiantes,
    } = useEstudiantesStore();
    const asignaturas   = useAsignaturasStore((s) => s.asignaturas);
    const loadAsignaturas = useAsignaturasStore((s) => s.load);
    const institutionId = useInstitutionStore((s) => s.currentId);
    const defaultLecciones = useConfiguracionStore((s) => s.defaultLecciones);
    const asigCatalogue: AsigRef[] = asignaturas.map((a) => ({ id: a.id, nombre: a.nombre, grupo: Math.trunc(a.grupo), seccion: Math.trunc(a.seccion), year: a.year }));
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const selectAllRef = useRef<HTMLInputElement | null>(null);

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
    const [importing, setImporting] = useState(false);
    const [importMessage, setImportMessage] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);

    const grupos   = useMemo(() => [...new Set(asignaturas.map((a) => String(Math.trunc(a.grupo))))].sort((a, b) => Number(a) - Number(b)), [asignaturas]);
    const secciones = useMemo(() => [...new Set(asignaturas.map((a) => String(Math.trunc(a.seccion))))].sort((a, b) => Number(a) - Number(b)), [asignaturas]);

    const activeFilterCount = [filterAde, filterAsig, filterGrupo, filterSeccion].filter(Boolean).length;

    const filtered = useMemo(() => {
        const q = normalizeSearchText(search);
        const list = estudiantes.filter((e) => {
            const matchSearch = !q || normalizeSearchText(e.nombreCompleto).includes(q) || e.cedula.includes(q);
            const matchAde    = !filterAde    || e.adecuacion === filterAde;
            const matchAsig   = !filterAsig   || e.asignaturas.some((a) => a.id === filterAsig);
            const matchGrupo  = !filterGrupo  || e.asignaturas.some((a) => String(a.grupo) === filterGrupo);
            const matchSec    = !filterSeccion|| e.asignaturas.some((a) => String(a.seccion) === filterSeccion);
            return matchSearch && matchAde && matchAsig && matchGrupo && matchSec;
        });
        return [...list].sort((a, b) => {
            const mul = sortDir === "asc" ? 1 : -1;
            if (sortKey === "nombre") return mul * a.nombreCompleto.localeCompare(b.nombreCompleto, "es", { sensitivity: "base" });
            if (sortKey === "edad")   return mul * ((calcAge(a.fechaNacimiento) ?? 0) - (calcAge(b.fechaNacimiento) ?? 0));
            return mul * a.adecuacion.localeCompare(b.adecuacion, "es", { sensitivity: "base" });
        });
    }, [estudiantes, search, filterAde, filterAsig, filterGrupo, filterSeccion, sortKey, sortDir]);

    const filteredIds = useMemo(() => filtered.map((student) => student.id), [filtered]);
    const selectedVisibleCount = useMemo(
        () => filteredIds.filter((id) => selectedIds.includes(id)).length,
        [filteredIds, selectedIds]
    );
    const allVisibleSelected = filteredIds.length > 0 && selectedVisibleCount === filteredIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < filteredIds.length;

    useEffect(() => {
        setSelectedIds((current) => current.filter((id) => estudiantes.some((student) => student.id === id)));
    }, [estudiantes]);

    useEffect(() => {
        if (!selectAllRef.current) return;
        selectAllRef.current.indeterminate = someVisibleSelected;
    }, [someVisibleSelected]);

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
    const handleToggleSelect = (id: string) => {
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
        );
    };
    const handleToggleSelectAll = () => {
        setSelectedIds((current) => {
            if (allVisibleSelected) {
                return current.filter((id) => !filteredIds.includes(id));
            }
            return [...new Set([...current, ...filteredIds])];
        });
    };
    const handleDeleteSelected = async () => {
        if (!selectedIds.length) return;
        const confirmed = window.confirm(`\u00bfEliminar ${selectedIds.length} estudiante(s) seleccionados?`);
        if (!confirmed) return;
        await deleteEstudiantes(selectedIds);
        setSelectedIds([]);
    };
    const handleAssignSelected = async (asignaturaId: string) => {
        await assignAsignaturaToEstudiantes(institutionId, selectedIds, asignaturaId);
        setShowAssignModal(false);
        setSelectedIds([]);
    };

    const handleImportClick = () => {
        setImportMessage("");
        importInputRef.current?.click();
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || importing) return;

        setImporting(true);
        setImportMessage("");
        try {
            const rows = await parseExcelFile(file);
            if (rows.length === 0) {
                console.warn("[students/import] El archivo se pudo leer, pero no produjo filas importables.");
                setImportMessage("El archivo se leyo, pero no se encontraron estudiantes importables.");
                return;
            }
            await importEstudiantes(institutionId, rows, asigCatalogue, defaultLecciones);
            await loadAsignaturas(institutionId);
            console.log("[students/import] Importacion completada", {
                count: rows.length,
                institutionId,
            });
            setImportMessage("");
        } catch (error) {
            console.error("[students/import] Error final en importacion", error);
            setImportMessage(formatUnknownError(error));
        } finally {
            setImporting(false);
        }
    };

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
                    {importMessage && <p>{importMessage}</p>}
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.headerUtilityActions}>
                    <button type="button" className={styles.filterToggleBtn} onClick={handleImportClick} disabled={importing}>
                        {importing ? "Importando..." : "Importar Excel"}
                    </button>
                    {selectedIds.length > 0 && (
                    <button
                        type="button"
                        className={styles.filterToggleBtn}
                        onClick={() => setShowAssignModal(true)}
                        disabled={asigCatalogue.length === 0}
                    >
                        {"A\u00f1adir asignatura ("}{selectedIds.length}{")"}
                    </button>
                    )}
                    {selectedIds.length > 0 && (
                    <button
                        type="button"
                        className={styles.clearAll}
                        onClick={handleDeleteSelected}
                    >
                        Eliminar seleccionados ({selectedIds.length})
                    </button>
                    )}
                    </div>
                    <button className={styles.addBtn} onClick={openCreate}>
                        <PlusIcon /> Nuevo estudiante
                    </button>
                </div>
            </div>
            <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xltx,.xltm"
                style={{ display: "none" }}
                onChange={handleImportFile}
            />

            {/* Ã¢â€â‚¬Ã¢â€â‚¬ Toolbar Ã¢â€â‚¬Ã¢â€â‚¬ */}
            <div className={styles.toolbar}>
                <SearchInput value={search} onChange={setSearch} placeholder={"Buscar por nombre o c\u00e9dula..."} width={240} />

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
                                    <label>{"Adecuaci\u00f3n"}</label>
                                    <select value={filterAde} onChange={(e) => setFilterAde(e.target.value as Adecuacion | "")}>
                                        <option value="">Todas</option>
                                        <option value="acceso">Acceso</option>
                                        <option value="significativa">Significativa</option>
                                        <option value="no_significativa">No significativa</option>
                                        <option value="no_tiene">{"Sin adecuaci\u00f3n"}</option>
                                    </select>
                                </div>
                                <div className={styles.filterPopoverRow}>
                                    <label>Asignatura</label>
                                    <select value={filterAsig} onChange={(e) => setFilterAsig(e.target.value)}>
                                        <option value="">Todas</option>
                                        {asignaturas.map((a) => <option key={a.id} value={a.id}>{`${a.nombre} \u00b7 ${a.grupo}`}</option>)}
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
                                    <label>{"Secci\u00f3n"}</label>
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

            {/* Ã¢â€â‚¬Ã¢â€â‚¬ Table Ã¢â€â‚¬Ã¢â€â‚¬ */}
            <div className={styles.tableWrap}>
                <div className={styles.tableScroll}>
                    <table>
                        <thead>
                            <tr>
                                <th className={styles.thCheck}>
                                    <input
                                        ref={selectAllRef}
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={handleToggleSelectAll}
                                        disabled={filtered.length === 0}
                                        aria-label="Seleccionar todos los estudiantes visibles"
                                    />
                                </th>
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
                                    <td colSpan={8}>
                                        <EmptyState
                                            title={estudiantes.length === 0 ? "Sin estudiantes registrados" : "Sin resultados"}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((e) => (
                                    <EstudianteCard
                                        key={e.id}
                                        est={e}
                                        selected={selectedIds.includes(e.id)}
                                        onEdit={openEdit}
                                        onDelete={handleDelete}
                                        onToggleSelect={handleToggleSelect}
                                    />
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
            {showAssignModal && (
                <BulkAssignModal
                    selectedCount={selectedIds.length}
                    asignaturas={asigCatalogue}
                    onSave={handleAssignSelected}
                    onClose={() => setShowAssignModal(false)}
                />
            )}
        </>
    );
}


