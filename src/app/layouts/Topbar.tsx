import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store";
import { useThemeStore } from "../../features/theme/store";
import { useNotificationsStore, type NotifPriority } from "../../features/notifications/store";
import { BellIcon, CheckIcon, TrashIcon, UserIcon, SettingsIcon, LogOutIcon, SunIcon, MoonIcon } from "../../shared/ui/icons";
import styles from "./Topbar.module.css";

const TITLES: Record<string, string> = {
    "/app":               "Asignaturas",
    "/app/estudiantes":   "Estudiantes",
    "/app/reportes":      "Reportes",
    "/app/horarios":      "Horarios",
    "/app/evaluaciones":  "Evaluaciones",
    "/app/asistencia":    "Asistencia",
    "/app/configuracion": "Configuración",
};

const PRIORITY_LABEL: Record<NotifPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };
const PRIORITY_COLOR: Record<NotifPriority, string> = {
    alta:  "var(--danger)",
    media: "#f59e0b",
    baja:  "var(--tx-3)",
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

    const { notifications, markRead, markAllRead, remove, clearRead } = useNotificationsStore();

    const navigate     = useNavigate();
    const { pathname } = useLocation();

    const [notifOpen,   setNotifOpen]   = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    const notifRef   = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    useClickOutside(notifRef,   () => setNotifOpen(false));
    useClickOutside(profileRef, () => setProfileOpen(false));

    const unread       = notifications.filter((n) => !n.read).length;
    const hasRead      = notifications.some((n) => n.read);
    const title        = TITLES[pathname] ?? "Grading App";
    const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

    return (
        <header className={styles.topbar}>
            <span className={styles.title}>{title}</span>

            <div className={styles.actions}>
                <button className={styles.themeBtn} onClick={toggle}
                    title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}>
                    {theme === "light" ? <MoonIcon /> : <SunIcon />}
                </button>

                {/* ── Notification bell ── */}
                <div ref={notifRef} style={{ position: "relative" }}>
                    <button className={styles.iconBtn}
                        onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
                        aria-label="Notificaciones">
                        <BellIcon />
                        {unread > 0 && (
                            <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span>
                        )}
                    </button>

                    {notifOpen && (
                        <div className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <span className={styles.panelTitle}>Notificaciones</span>
                                <div className={styles.panelActions}>
                                    {unread > 0 && (
                                        <button className={styles.panelAction} onClick={markAllRead}>
                                            Marcar leídas
                                        </button>
                                    )}
                                    {hasRead && (
                                        <button className={styles.panelAction} onClick={clearRead}>
                                            Borrar leídas
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.notifList}>
                                {notifications.length === 0 && (
                                    <div className={styles.emptyNotif}>Sin notificaciones</div>
                                )}
                                {notifications.map((n) => (
                                    <div key={n.id}
                                        className={`${styles.notifItem}${n.read ? "" : ` ${styles.unread}`}`}>
                                        <div className={styles.notifPriorityBar}
                                            style={{ background: PRIORITY_COLOR[n.priority] }} />
                                        <div className={styles.notifBody}>
                                            <div className={styles.notifMeta}>
                                                <span className={styles.notifPriorityLabel}
                                                    style={{ color: PRIORITY_COLOR[n.priority] }}>
                                                    {PRIORITY_LABEL[n.priority]}
                                                </span>
                                                <time className={styles.notifTime}>{n.time}</time>
                                            </div>
                                            <p className={styles.notifText}>{n.text}</p>
                                        </div>
                                        <div className={styles.notifItemActions}>
                                            {!n.read && (
                                                <button className={styles.notifBtn}
                                                    title="Marcar como leída"
                                                    onClick={() => markRead(n.id)}>
                                                    <CheckIcon />
                                                </button>
                                            )}
                                            <button className={`${styles.notifBtn} ${styles.notifBtnDanger}`}
                                                title="Eliminar"
                                                onClick={() => remove(n.id)}>
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.divider} />

                {/* ── Profile ── */}
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
