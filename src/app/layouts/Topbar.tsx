import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store";
import { useThemeStore } from "../../features/theme/store";
import { BellIcon, UserIcon, SettingsIcon, LogOutIcon, SunIcon, MoonIcon } from "../../shared/ui/icons";
import styles from "./Topbar.module.css";

const MOCK_NOTIFS = [
    { id: 1, text: "Nueva evaluación asignada en Matemáticas II", time: "hace 5 min",  unread: true },
    { id: 2, text: "Carlos Pérez subió su tarea pendiente",       time: "hace 20 min", unread: true },
    { id: 3, text: "Horario actualizado para el martes",          time: "hace 1 h",    unread: false },
    { id: 4, text: "Recordatorio: calificaciones por entregar",   time: "ayer",        unread: false },
];

const TITLES: Record<string, string> = {
    "/app":              "Asignaturas",
    "/app/estudiantes":  "Estudiantes",
    "/app/reportes":     "Reportes",
    "/app/horarios":     "Horarios",
    "/app/evaluaciones": "Evaluaciones",
};

function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [ref, cb]);
}

export function Topbar() {
    const user   = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const theme  = useThemeStore((s) => s.theme);
    const toggle = useThemeStore((s) => s.toggle);

    const navigate       = useNavigate();
    const { pathname }   = useLocation();

    const [notifOpen,   setNotifOpen]   = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [notifs,      setNotifs]      = useState(MOCK_NOTIFS);

    const notifRef   = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    useClickOutside(notifRef,   () => setNotifOpen(false));
    useClickOutside(profileRef, () => setProfileOpen(false));

    const unread     = notifs.filter((n) => n.unread).length;
    const title      = TITLES[pathname] ?? "Grading App";
    const markAllRead = () => setNotifs((n) => n.map((i) => ({ ...i, unread: false })));
    const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

    return (
        <header className={styles.topbar}>
            <span className={styles.title}>{title}</span>

            <div className={styles.actions}>
                <button className={styles.themeBtn} onClick={toggle}
                    title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}>
                    {theme === "light" ? <MoonIcon /> : <SunIcon />}
                </button>

                <div ref={notifRef} style={{ position: "relative" }}>
                    <button className={styles.iconBtn}
                        onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
                        aria-label="Notificaciones">
                        <BellIcon />
                        {unread > 0 && <span className={styles.badge} />}
                    </button>
                    {notifOpen && (
                        <div className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <span className={styles.panelTitle}>
                                    Notificaciones{unread > 0 ? ` (${unread})` : ""}
                                </span>
                                {unread > 0 && (
                                    <button className={styles.markRead} onClick={markAllRead}>Marcar leídas</button>
                                )}
                            </div>
                            <div className={styles.notifList}>
                                {notifs.map((n) => (
                                    <div key={n.id} className={`${styles.notifItem}${n.unread ? ` ${styles.unread}` : ""}`}>
                                        {n.unread && <div className={styles.notifDot} />}
                                        <div className={styles.notifContent} style={n.unread ? {} : { paddingLeft: "19px" }}>
                                            <p>{n.text}</p>
                                            <time>{n.time}</time>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.divider} />

                <div ref={profileRef} style={{ position: "relative" }}>
                    <button className={styles.profileBtn}
                        onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}>
                        <div className={styles.avatar}>{user ? getInitials(user.name) : "?"}</div>
                        <span className={styles.profileName}>{user?.name ?? "Usuario"}</span>
                        <svg className={`${styles.chevron}${profileOpen ? ` ${styles.open}` : ""}`}
                            viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    {profileOpen && (
                        <div className={styles.profilePanel}>
                            <button className={styles.profileItem}><UserIcon /> Mi perfil</button>
                            <button className={styles.profileItem}><SettingsIcon /> Configuración</button>
                            <div className={styles.profileDivider} />
                            <button className={`${styles.profileItem} ${styles.profileItemDanger}`} onClick={handleLogout}>
                                <LogOutIcon /> Cerrar sesión
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
