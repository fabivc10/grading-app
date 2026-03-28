import { useState, type FormEvent, useRef, useEffect, type ChangeEvent, type DragEvent } from "react";
import { NavLink } from "react-router-dom";
import { useInstitutionStore, selectCurrentInstitution } from "../../features/institution/store";
import { readInstitutionIcon } from "../../features/institution/repositories/institution-icon.repository";
import type { Institution } from "../../features/institution/types";
import {
    BookIcon,
    UsersIcon,
    BarChartIcon,
    CalendarIcon,
    ClipboardIcon,
    PlusIcon,
    CheckIcon,
    CloseIcon,
    BellIcon,
    SettingsIcon,
    EditIcon,
    TrashIcon,
} from "../../shared/ui/icons";
import styles from "./Sidebar.module.css";

const NAV = [
    { to: "/app", label: "Asignaturas", Icon: BookIcon, end: true },
    { to: "/app/estudiantes", label: "Estudiantes", Icon: UsersIcon, end: false },
    { to: "/app/evaluaciones", label: "Evaluaciones", Icon: ClipboardIcon, end: false },
    { to: "/app/asistencia", label: "Asistencia", Icon: BellIcon, end: false },
    { to: "/app/horarios", label: "Horarios", Icon: CalendarIcon, end: false },
    { to: "/app/reportes", label: "Reportes", Icon: BarChartIcon, end: false },
    { to: "/app/configuracion", label: "Configuracion", Icon: SettingsIcon, end: false },
];

const TIPOS_INSTITUCION: { grupo: string; opciones: string[] }[] = [
    {
        grupo: "Educacion Preescolar",
        opciones: ["Jardin de Ninos", "Materno Infantil"],
    },
    {
        grupo: "Educacion Primaria",
        opciones: ["Escuela (Direccion 1-5)", "Escuela Unidocente"],
    },
    {
        grupo: "Educacion Secundaria Academica",
        opciones: [
            "Colegio Academico",
            "Liceo Rural",
            "Colegio Nocturno",
            "Liceo Experimental Bilingue",
            "Colegio Humanistico",
        ],
    },
    {
        grupo: "Educacion Tecnica",
        opciones: ["Colegio Tecnico Profesional (CTP)", "Secciones Tecnicas"],
    },
    {
        grupo: "Educacion de Jovenes y Adultos (EPJA)",
        opciones: ["CINDEA", "IPEC"],
    },
    {
        grupo: "Educacion Especial",
        opciones: ["Centro de Educacion Especial"],
    },
    {
        grupo: "Otras Modalidades",
        opciones: [
            "Telesecundaria",
            "Aula Abierta",
            "Aula Integrada",
            "Educacion Abierta (Bachillerato por Madurez)",
        ],
    },
];

const DIRECCIONES_REGIONALES = [
    "Alajuela", "Cartago", "Coto", "Desamparados", "Grande de Terraba",
    "Guapiles", "Heredia", "Liberia", "Limon", "Los Santos",
    "Nicoya", "Occidente", "Osa", "Palmar", "Peninsular",
    "Perez Zeledon", "Puriscal", "Sarapiqui", "San Carlos",
    "San Jose Central", "San Jose Norte", "San Jose Oeste", "San Jose Sur",
    "Santa Cruz", "Sula", "Turrialba", "Zona Norte-Norte",
];

type InstFormData = {
    name: string;
    code: string;
    tipoInstitucion: string;
    direccionRegional: string;
    circuito: string;
    address: string;
    iconPath?: string;
};

function InstitutionAvatar({
    code,
    iconUrl,
    alt,
}: {
    code: string;
    iconUrl?: string | null;
    alt: string;
}) {
    return (
        <div className={styles.instAvatar}>
            {iconUrl ? <img src={iconUrl} alt={alt} className={styles.instAvatarImg} /> : code}
        </div>
    );
}

function TipoDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const label = value || "Seleccionar...";

    return (
        <div ref={ref} className={styles.tipoDropdown}>
            <button
                type="button"
                className={`${styles.tipoTrigger}${value ? "" : ` ${styles.tipoPlaceholder}`}`}
                onClick={() => setOpen((v) => !v)}
            >
                <span>{label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <div className={styles.tipoPanel}>
                    {TIPOS_INSTITUCION.map((g, gi) => (
                        <div key={g.grupo} className={`${styles.tipoGroup}${gi > 0 ? ` ${styles.tipoGroupBorder}` : ""}`}>
                            <span className={styles.tipoGroupLabel}>{g.grupo}</span>
                            {g.opciones.map((o) => (
                                <button
                                    key={o}
                                    type="button"
                                    className={`${styles.tipoOption}${value === o ? ` ${styles.tipoOptionActive}` : ""}`}
                                    onClick={() => { onChange(o); setOpen(false); }}
                                >
                                    {o}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function InstitutionModal({
    initial,
    onSave,
    onClose,
}: {
    initial?: Institution;
    onSave: (data: InstFormData) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [code, setCode] = useState(initial?.code ?? "");
    const [tipo, setTipo] = useState(initial?.tipoInstitucion ?? "");
    const [dir, setDir] = useState(initial?.direccionRegional ?? "");
    const [circ, setCirc] = useState(initial?.circuito ?? "");
    const [address, setAddress] = useState(initial?.address ?? "");
    const [iconPath, setIconPath] = useState(initial?.iconPath);
    const [iconPreview, setIconPreview] = useState<string | null>(null);
    const [iconName, setIconName] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [photoExpanded, setPhotoExpanded] = useState(Boolean(initial?.iconPath));
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isEdit = Boolean(initial);
    const valid = name.trim() !== "" && code.trim() !== "" && tipo !== "" && dir !== "" && circ.trim() !== "";

    useEffect(() => {
        let cancelled = false;
        if (!initial?.iconPath) {
            setIconPreview(null);
            return;
        }

        readInstitutionIcon(initial.iconPath).then((url) => {
            if (!cancelled) setIconPreview(url);
        }).catch(() => {
            if (!cancelled) setIconPreview(null);
        });

        return () => { cancelled = true; };
    }, [initial?.iconPath]);

    const loadIconFile = (file?: File | null) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            setIconPreview(reader.result);
            setIconPath(reader.result);
            setIconName(file.name);
        };
        reader.readAsDataURL(file);
    };

    const handleIconChange = (e: ChangeEvent<HTMLInputElement>) => {
        loadIconFile(e.target.files?.[0]);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragActive(false);
        loadIconFile(e.dataTransfer.files?.[0]);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        try {
            await onSave({
                name: name.trim(),
                code: code.trim().toUpperCase(),
                tipoInstitucion: tipo,
                direccionRegional: dir,
                circuito: circ.trim(),
                address: address.trim(),
                iconPath,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.instModal} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.instModalCard}>
                <div className={styles.instModalHeader}>
                    <span className={styles.instModalTitle}>{isEdit ? "Editar centro educativo" : "Nuevo centro educativo"}</span>
                    <button className={styles.instModalClose} onClick={onClose} disabled={saving}><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className={styles.instModalBody}>
                        <div className={styles.instField}>
                            <label>Nombre del centro educativo</label>
                            <input type="text" placeholder="Ej: Liceo Nacional de Costa Rica" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
                        </div>
                        <div className={styles.instField}>
                            <div className={styles.photoFieldHeader}>
                                <label>Foto del centro educativo</label>
                                <button type="button" className={styles.photoToggleBtn} onClick={() => setPhotoExpanded((v) => !v)}>
                                    {photoExpanded ? "Colapsar" : iconPreview ? "Editar foto" : "Agregar foto"}
                                </button>
                            </div>
                            {photoExpanded && (
                                <>
                                    <div
                                        className={`${styles.uploadDropzone}${dragActive ? ` ${styles.uploadDropzoneActive}` : ""}`}
                                        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                        onDragLeave={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                                            setDragActive(false);
                                        }}
                                        onDrop={handleDrop}
                                    >
                                        <div className={styles.uploadDropzoneInner}>
                                            <div className={styles.uploadIconBadge}>
                                                {iconPreview ? (
                                                    <img src={iconPreview} alt={name || "Centro educativo"} className={styles.uploadIconPreview} />
                                                ) : (
                                                    <svg viewBox="0 0 24 24" className={styles.uploadGlyph} aria-hidden="true">
                                                        <path d="M12 16V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                                        <path d="M8.5 10.5 12 7l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className={styles.uploadTextBlock}>
                                                <span className={styles.uploadTitle}>Subir imagen</span>
                                                <span className={styles.uploadHint}>Haz clic o arrastra tu archivo aqui.</span>
                                                <span className={styles.uploadMeta}>PNG, JPG, WEBP o GIF. Maximo 10 MB.</span>
                                            </div>
                                        </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            onChange={handleIconChange}
                                            className={styles.uploadInput}
                                        />
                                        <button
                                            type="button"
                                            className={styles.uploadBrowseBtn}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            Seleccionar
                                        </button>
                                    </div>
                                    {iconPreview && (
                                        <div className={styles.uploadFileCard}>
                                            <div className={styles.uploadFileHeader}>
                                                <div className={styles.uploadFileMeta}>
                                                    <span className={styles.uploadFileName}>{iconName || "Imagen seleccionada"}</span>
                                                    <span className={styles.uploadFileSize}>Lista para guardar</span>
                                                </div>
                                                <span className={styles.uploadFilePct}>100%</span>
                                            </div>
                                            <div className={styles.uploadProgressTrack}>
                                                <div className={styles.uploadProgressFill} />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className={styles.instField}>
                            <label>Codigo (3-4 letras)</label>
                            <input type="text" placeholder="Ej: LNCR" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} required />
                        </div>
                        <div className={styles.instField}>
                            <label>Tipo de centro educativo</label>
                            <TipoDropdown value={tipo} onChange={setTipo} />
                        </div>
                        <div className={styles.instField}>
                            <label>Direccion Regional (MEP)</label>
                            <select value={dir} onChange={(e) => setDir(e.target.value)} required>
                                <option value="">Seleccionar...</option>
                                {DIRECCIONES_REGIONALES.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className={styles.instField}>
                            <label>Circuito Educativo</label>
                            <input type="text" placeholder="Ej: 01 o 02-A" value={circ} onChange={(e) => setCirc(e.target.value)} required />
                        </div>
                        <div className={styles.instField}>
                            <label>Ubicacion (opcional)</label>
                            <input type="text" placeholder="Ej: San Jose, Montes de Oca" value={address} onChange={(e) => setAddress(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.instModalFooter}>
                        <button type="button" className={styles.instCancelBtn} onClick={onClose} disabled={saving}>Cancelar</button>
                        <button type="submit" className={styles.instSaveBtn} disabled={!valid || saving}>
                            {isEdit ? "Guardar cambios" : "Crear centro educativo"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function Sidebar() {
    const { institutions, switchTo, addInstitution, updateInstitution, deleteInstitution } = useInstitutionStore();
    const current = useInstitutionStore(selectCurrentInstitution);
    const [iconUrls, setIconUrls] = useState<Record<number, string | null>>({});
    const [open, setOpen] = useState(false);
    const [addingInst, setAddingInst] = useState(false);
    const [editingInst, setEditingInst] = useState<Institution | null>(null);
    const [confirmDel, setConfirmDel] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all(institutions.map(async (inst) => {
            const url = await readInstitutionIcon(inst.iconPath);
            return [inst.id, url] as const;
        })).then((entries) => {
            if (!cancelled) setIconUrls(Object.fromEntries(entries));
        }).catch(() => {
            if (!cancelled) setIconUrls({});
        });

        return () => { cancelled = true; };
    }, [institutions]);

    const handleAdd = async (data: InstFormData) => {
        await addInstitution({
            name: data.name,
            code: data.code,
            tipoInstitucion: data.tipoInstitucion,
            direccionRegional: data.direccionRegional,
            circuito: data.circuito,
            address: data.address,
            iconPath: data.iconPath,
        });
        setAddingInst(false);
    };

    const handleEdit = async (data: InstFormData) => {
        if (!editingInst) return;
        await updateInstitution(
            editingInst.id,
            {
                name: data.name,
                code: data.code,
                tipoInstitucion: data.tipoInstitucion,
                direccionRegional: data.direccionRegional,
                circuito: data.circuito,
                address: data.address,
                iconPath: data.iconPath,
            },
            editingInst.iconPath
        );
        setEditingInst(null);
    };

    const handleDelete = (id: number) => {
        deleteInstitution(id);
        setConfirmDel(null);
    };

    return (
        <>
            <aside className={styles.sidebar}>
                <div className={styles.brand}>
                    <img src="/icon.png" alt="Grading App" className={styles.brandIcon} />
                    <span className={styles.brandName}>Grading App</span>
                </div>

                <nav className={styles.nav}>
                    {NAV.map(({ to, label, Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) => `${styles.navItem}${isActive ? ` ${styles.active}` : ""}`}
                        >
                            <Icon /><span>{label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className={styles.switcher}>
                    <div className={styles.switcherHeader}>
                        <span className={styles.switcherLabel}>Centro educativo</span>
                        <button className={styles.addInstBtn} onClick={() => setAddingInst(true)} title="Agregar centro educativo">
                            <PlusIcon />
                        </button>
                    </div>

                    {open && (
                        <div className={styles.dropdown}>
                            {institutions.map((inst) => (
                                <div key={inst.id} className={styles.dropdownRow}>
                                    {confirmDel === inst.id ? (
                                        <div className={styles.deleteConfirmRow}>
                                            <span>Eliminar "{inst.name}"?</span>
                                            <button className={styles.confirmYes} onClick={() => handleDelete(inst.id)}>Si</button>
                                            <button className={styles.confirmNo} onClick={() => setConfirmDel(null)}>No</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                className={`${styles.dropdownItem}${inst.id === current.id ? ` ${styles.selected}` : ""}`}
                                                onClick={() => { switchTo(inst.id); setOpen(false); }}
                                                title={inst.name}
                                            >
                                                <InstitutionAvatar code={inst.code} iconUrl={iconUrls[inst.id]} alt={inst.name} />
                                                <span className={styles.dropdownItemName}>{inst.name}</span>
                                                {inst.id === current.id && <CheckIcon className={styles.checkIcon} />}
                                            </button>
                                            <div className={styles.dropdownActions}>
                                                <button className={styles.dropdownActionBtn} title="Editar" onClick={(e) => { e.stopPropagation(); setEditingInst(inst); setOpen(false); }}><EditIcon /></button>
                                                <button className={`${styles.dropdownActionBtn} ${styles.dropdownActionDel}`} title="Eliminar" onClick={(e) => { e.stopPropagation(); setConfirmDel(inst.id); }}><TrashIcon /></button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <button className={styles.switcherBtn} onClick={() => setOpen((v) => !v)}>
                        <InstitutionAvatar code={current.code} iconUrl={iconUrls[current.id]} alt={current.name} />
                        <div className={styles.instMeta}>
                            <span className={styles.instLabel}>Area de trabajo</span>
                            <span className={styles.instName}>{current.name}</span>
                        </div>
                        <svg
                            className={`${styles.chevron}${open ? ` ${styles.open}` : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>
            </aside>

            {addingInst && <InstitutionModal onSave={handleAdd} onClose={() => setAddingInst(false)} />}
            {editingInst && <InstitutionModal initial={editingInst} onSave={handleEdit} onClose={() => setEditingInst(null)} />}
        </>
    );
}
