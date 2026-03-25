import { useState, FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useInstitutionStore, selectCurrentInstitution } from "../../features/institution/store";
import { BookIcon, UsersIcon, BarChartIcon, CalendarIcon, ClipboardIcon, PlusIcon, CheckIcon, CloseIcon, BellIcon, SettingsIcon } from "../../shared/ui/icons";
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
const TIPOS_INSTITUCION = [
    "Jardín de Niños",
    "Escuela Primaria",
    "Colegio Académico Diurno",
    "Colegio Académico Nocturno",
    "Liceo",
    "Colegio Técnico Profesional (CTP)",
    "CINDEA",
    "IPEC",
    "Telesecundaria",
    "Centro de Educación Especial",
];

const DIRECCIONES_REGIONALES = [
    "Alajuela", "Cartago", "Coto", "Desamparados", "Grande de Térraba",
    "Guápiles", "Heredia", "Liberia", "Limón", "Los Santos",
    "Nicoya", "Occidente", "Osa", "Palmar", "Peninsular",
    "Pérez Zeledón", "Puriscal", "Sarapiquí", "San Carlos",
    "San José Central", "San José Norte", "San José Oeste", "San José Sur",
    "Santa Cruz", "Sulá", "Turrialba", "Zona Norte-Norte",
];

// ─── Add institution modal ────────────────────────────────────────────────────
type NewInstData = { name: string; code: string; tipoInstitucion: string; direccionRegional: string; circuito: string; address: string; };

function AddInstitutionModal({ onSave, onClose }: {
    onSave: (data: NewInstData) => void;
    onClose: () => void;
}) {
    const [name,    setName]    = useState("");
    const [code,    setCode]    = useState("");
    const [tipo,    setTipo]    = useState("");
    const [dir,     setDir]     = useState("");
    const [circ,    setCirc]    = useState("");
    const [address, setAddress] = useState("");

    const valid = name.trim() !== "" && code.trim() !== "" && tipo !== "" && dir !== "" && circ.trim() !== "";

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            tipoInstitucion: tipo,
            direccionRegional: dir,
            circuito: circ.trim(),
            address: address.trim(),
        });
    };

    return (
        <div className={styles.instModal} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.instModalCard}>
                <div className={styles.instModalHeader}>
                    <span className={styles.instModalTitle}>Nueva institución</span>
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
                            <label>Tipo de institución</label>
                            <select value={tipo} onChange={(e) => setTipo(e.target.value)} required>
                                <option value="">Seleccionar...</option>
                                {TIPOS_INSTITUCION.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className={styles.instField}>
                            <label>Dirección Regional (MEP)</label>
                            <select value={dir} onChange={(e) => setDir(e.target.value)} required>
                                <option value="">Seleccionar...</option>
                                {DIRECCIONES_REGIONALES.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className={styles.instField}>
                            <label>Circuito</label>
                            <input type="text" placeholder="Ej: 01 o 02-A" value={circ} onChange={(e) => setCirc(e.target.value)} required />
                        </div>
                        <div className={styles.instField}>
                            <label>Ubicación (opcional)</label>
                            <input type="text" placeholder="Ej: San José, Montes de Oca" value={address} onChange={(e) => setAddress(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.instModalFooter}>
                        <button type="button" className={styles.instCancelBtn} onClick={onClose}>Cancelar</button>
                        <button type="submit" className={styles.instSaveBtn} disabled={!valid}>Crear institución</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar() {
    const { institutions, switchTo, addInstitution } = useInstitutionStore();
    const current = useInstitutionStore(selectCurrentInstitution);
    const [open,       setOpen]       = useState(false);
    const [addingInst, setAddingInst] = useState(false);

    const handleAddInst = (data: NewInstData) => {
        addInstitution(data);
        setAddingInst(false);
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
                        <span className={styles.switcherLabel}>Institución</span>
                        <button className={styles.addInstBtn} onClick={() => setAddingInst(true)} title="Agregar institución">
                            <PlusIcon />
                        </button>
                    </div>

                    {open && (
                        <div className={styles.dropdown}>
                            {institutions.map((inst) => (
                                <button key={inst.id}
                                    className={`${styles.dropdownItem}${inst.id === current.id ? ` ${styles.selected}` : ""}`}
                                    onClick={() => { switchTo(inst.id); setOpen(false); }}>
                                    <div className={styles.instAvatar}>{inst.code}</div>
                                    <span>{inst.name}</span>
                                    {inst.id === current.id && <CheckIcon className={styles.checkIcon} />}
                                </button>
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

            {addingInst && (
                <AddInstitutionModal onSave={handleAddInst} onClose={() => setAddingInst(false)} />
            )}
        </>
    );
}
