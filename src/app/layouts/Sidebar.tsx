import { useState, FormEvent, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useInstitutionStore, selectCurrentInstitution } from "../../features/institution/store";
import { BookIcon, UsersIcon, BarChartIcon, CalendarIcon, ClipboardIcon, PlusIcon, CheckIcon, CloseIcon, BellIcon, SettingsIcon, EditIcon, TrashIcon } from "../../shared/ui/icons";
import styles from "./Sidebar.module.css";

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV = [
    { to: "/app",              label: "Asignaturas",  Icon: BookIcon,      end: true },
    { to: "/app/estudiantes",  label: "Estudiantes",  Icon: UsersIcon,     end: false },
    { to: "/app/evaluaciones", label: "Evaluaciones", Icon: ClipboardIcon, end: false },
    { to: "/app/asistencia",   label: "Asistencia",   Icon: BellIcon,      end: false },
    { to: "/app/horarios",     label: "Horarios",     Icon: CalendarIcon,  end: false },
    { to: "/app/reportes",       label: "Reportes",       Icon: BarChartIcon,  end: false },
    { to: "/app/configuracion",  label: "Configuración",  Icon: SettingsIcon,  end: false },
];

// ─── CR Education constants ───────────────────────────────────────────────────
const TIPOS_INSTITUCION: { grupo: string; opciones: string[] }[] = [
    {
        grupo: "Educación Preescolar",
        opciones: ["Jardín de Niños", "Materno Infantil"],
    },
    {
        grupo: "Educación Primaria",
        opciones: ["Escuela (Dirección 1–5)", "Escuela Unidocente"],
    },
    {
        grupo: "Educación Secundaria Académica",
        opciones: [
            "Colegio Académico",
            "Liceo Rural",
            "Colegio Nocturno",
            "Liceo Experimental Bilingüe",
            "Colegio Humanístico",
        ],
    },
    {
        grupo: "Educación Técnica",
        opciones: ["Colegio Técnico Profesional (CTP)", "Secciones Técnicas"],
    },
    {
        grupo: "Educación de Jóvenes y Adultos (EPJA)",
        opciones: ["CINDEA", "IPEC"],
    },
    {
        grupo: "Educación Especial",
        opciones: ["Centro de Educación Especial"],
    },
    {
        grupo: "Otras Modalidades",
        opciones: [
            "Telesecundaria",
            "Aula Abierta",
            "Aula Integrada",
            "Educación Abierta (Bachillerato por Madurez)",
        ],
    },
];

const DIRECCIONES_REGIONALES = [
    "Alajuela", "Cartago", "Coto", "Desamparados", "Grande de Térraba",
    "Guápiles", "Heredia", "Liberia", "Limón", "Los Santos",
    "Nicoya", "Occidente", "Osa", "Palmar", "Peninsular",
    "Pérez Zeledón", "Puriscal", "Sarapiquí", "San Carlos",
    "San José Central", "San José Norte", "San José Oeste", "San José Sur",
    "Santa Cruz", "Sulá", "Turrialba", "Zona Norte-Norte",
];

// ─── Grouped tipo dropdown ────────────────────────────────────────────────────
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
            <button type="button" className={`${styles.tipoTrigger}${value ? "" : ` ${styles.tipoPlaceholder}`}`} onClick={() => setOpen(v => !v)}>
                <span>{label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>
            {open && (
                <div className={styles.tipoPanel}>
                    {TIPOS_INSTITUCION.map((g, gi) => (
                        <div key={g.grupo} className={`${styles.tipoGroup}${gi > 0 ? ` ${styles.tipoGroupBorder}` : ""}`}>
                            <span className={styles.tipoGroupLabel}>{g.grupo}</span>
                            {g.opciones.map((o) => (
                                <button key={o} type="button"
                                    className={`${styles.tipoOption}${value === o ? ` ${styles.tipoOptionActive}` : ""}`}
                                    onClick={() => { onChange(o); setOpen(false); }}>
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

// ─── Institution modal (add & edit) ──────────────────────────────────────────
import type { Institution } from "../../features/institution/types";

type InstFormData = { name: string; code: string; tipoInstitucion: string; direccionRegional: string; circuito: string; address: string; };

function InstitutionModal({ initial, onSave, onClose }: {
    initial?: Institution;
    onSave: (data: InstFormData) => void;
    onClose: () => void;
}) {
    const [name,    setName]    = useState(initial?.name    ?? "");
    const [code,    setCode]    = useState(initial?.code    ?? "");
    const [tipo,    setTipo]    = useState(initial?.tipoInstitucion    ?? "");
    const [dir,     setDir]     = useState(initial?.direccionRegional  ?? "");
    const [circ,    setCirc]    = useState(initial?.circuito           ?? "");
    const [address, setAddress] = useState(initial?.address           ?? "");

    const isEdit = Boolean(initial);
    const valid  = name.trim() !== "" && code.trim() !== "" && tipo !== "" && dir !== "" && circ.trim() !== "";

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!valid) return;
        onSave({ name: name.trim(), code: code.trim().toUpperCase(), tipoInstitucion: tipo, direccionRegional: dir, circuito: circ.trim(), address: address.trim() });
    };

    return (
        <div className={styles.instModal} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.instModalCard}>
                <div className={styles.instModalHeader}>
                    <span className={styles.instModalTitle}>{isEdit ? "Editar centro educativo" : "Nuevo centro educativo"}</span>
                    <button className={styles.instModalClose} onClick={onClose}><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className={styles.instModalBody}>
                        <div className={styles.instField}>
                            <label>Nombre del centro educativo</label>
                            <input type="text" placeholder="Ej: Liceo Nacional de Costa Rica" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
                        </div>
                        <div className={styles.instField}>
                            <label>Código (3-4 letras)</label>
                            <input type="text" placeholder="Ej: LNCR" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} required />
                        </div>
                        <div className={styles.instField}>
                            <label>Tipo de centro educativo</label>
                            <TipoDropdown value={tipo} onChange={setTipo} />
                        </div>
                        <div className={styles.instField}>
                            <label>Dirección Regional (MEP)</label>
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
                            <label>Ubicación (opcional)</label>
                            <input type="text" placeholder="Ej: San José, Montes de Oca" value={address} onChange={(e) => setAddress(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.instModalFooter}>
                        <button type="button" className={styles.instCancelBtn} onClick={onClose}>Cancelar</button>
                        <button type="submit" className={styles.instSaveBtn} disabled={!valid}>
                            {isEdit ? "Guardar cambios" : "Crear centro educativo"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar() {
    const { institutions, switchTo, addInstitution, updateInstitution, deleteInstitution } = useInstitutionStore();
    const current = useInstitutionStore(selectCurrentInstitution);
    const [open,        setOpen]       = useState(false);
    const [addingInst,  setAddingInst] = useState(false);
    const [editingInst, setEditingInst] = useState<Institution | null>(null);
    const [confirmDel,  setConfirmDel] = useState<number | null>(null);

    const handleAdd = (data: InstFormData) => {
        addInstitution({ name: data.name, code: data.code, tipoInstitucion: data.tipoInstitucion, direccionRegional: data.direccionRegional, circuito: data.circuito, address: data.address });
        setAddingInst(false);
    };

    const handleEdit = (data: InstFormData) => {
        if (!editingInst) return;
        updateInstitution(editingInst.id, { name: data.name, code: data.code, tipoInstitucion: data.tipoInstitucion, direccionRegional: data.direccionRegional, circuito: data.circuito, address: data.address });
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
                    <div className={styles.brandIcon}>G</div>
                    <span className={styles.brandName}>Grading App</span>
                </div>

                <nav className={styles.nav}>
                    {NAV.map(({ to, label, Icon, end }) => (
                        <NavLink key={to} to={to} end={end}
                            className={({ isActive }) => `${styles.navItem}${isActive ? ` ${styles.active}` : ""}`}>
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
                                            <span>¿Eliminar "{inst.name}"?</span>
                                            <button className={styles.confirmYes} onClick={() => handleDelete(inst.id)}>Sí</button>
                                            <button className={styles.confirmNo}  onClick={() => setConfirmDel(null)}>No</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                className={`${styles.dropdownItem}${inst.id === current.id ? ` ${styles.selected}` : ""}`}
                                                onClick={() => { switchTo(inst.id); setOpen(false); }}
                                                title={inst.name}>
                                                <div className={styles.instAvatar}>{inst.code}</div>
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
                        <div className={styles.instAvatar}>{current.code}</div>
                        <div className={styles.instMeta}>
                            <span className={styles.instLabel}>Área de trabajo</span>
                            <span className={styles.instName}>{current.name}</span>
                        </div>
                        <svg className={`${styles.chevron}${open ? ` ${styles.open}` : ""}`}
                            viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                </div>
            </aside>

            {addingInst  && <InstitutionModal onSave={handleAdd}  onClose={() => setAddingInst(false)} />}
            {editingInst && <InstitutionModal initial={editingInst} onSave={handleEdit} onClose={() => setEditingInst(null)} />}
        </>
    );
}
