import { useState, useEffect, useRef } from "react";
import styles from "./Footer.module.css";

const TwitterIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
);
const LinkedInIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
);
const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
);
const InstagramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
);
const MailIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);
const ChevronIcon = ({ up }: { up: boolean }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: up ? "rotate(180deg)" : "none", transition: "transform 0.3s" }}>
        <polyline points="6 9 12 15 18 9"/>
    </svg>
);

export function Footer() {
    const year = new Date().getFullYear();
    const [collapsed, setCollapsed] = useState(false);
    const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-collapse after 5 s
    useEffect(() => {
        collapseTimer.current = setTimeout(() => setCollapsed(true), 5000);
        return () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
    }, []);

    const handleMouseEnter = () => {
        if (collapseTimer.current) clearTimeout(collapseTimer.current);
        setCollapsed(false);
    };

    const handleMouseLeave = () => {
        collapseTimer.current = setTimeout(() => setCollapsed(true), 2500);
    };

    return (
        <div
            className={`${styles.footerWrap}${collapsed ? ` ${styles.collapsed}` : ""}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <footer className={styles.footer}>
                <div className={styles.inner}>
                    {/* Col 1 */}
                    <div>
                        <div className={styles.brand}>
                            <div className={styles.brandIcon}>G</div>
                            <span className={styles.brandName}>Grading App</span>
                        </div>
                        <p className={styles.tagline}>
                            Plataforma integral para la gestión académica: calificaciones,
                            horarios y seguimiento estudiantil.
                        </p>
                    </div>

                    {/* Col 2 */}
                    <div>
                        <p className={styles.colTitle}>Redes Sociales</p>
                        <div className={styles.socialLinks}>
                            <a href="#" className={styles.socialLink}><TwitterIcon /> @GradingApp</a>
                            <a href="#" className={styles.socialLink}><LinkedInIcon /> GradingApp</a>
                            <a href="#" className={styles.socialLink}><InstagramIcon /> @grading.app</a>
                            <a href="#" className={styles.socialLink}><GitHubIcon /> grading-app</a>
                        </div>
                    </div>

                    {/* Col 3 */}
                    <div>
                        <p className={styles.colTitle}>Contacto</p>
                        <div className={styles.contactList}>
                            <span className={styles.contactItem}><MailIcon /> soporte@gradingapp.io</span>
                            <span className={styles.contactItem}><MailIcon /> ventas@gradingapp.io</span>
                            <span className={styles.contactItem}><MailIcon /> info@gradingapp.io</span>
                        </div>
                        <p className={styles.devBy}>
                            Desarrollado por <span>EduTech Solutions S.A. de C.V.</span>
                        </p>
                    </div>
                </div>

                <div className={styles.bottom}>
                    <span>© {year} EduTech Solutions. Todos los derechos reservados.</span>
                    <button
                        className={`${styles.expandHint}${collapsed ? ` ${styles.isCollapsed}` : ""}`}
                        onClick={() => setCollapsed((v) => !v)}
                    >
                        <ChevronIcon up={!collapsed} />
                        {collapsed ? "Mostrar pie" : "Ocultar"}
                    </button>
                    <span>v0.1.0</span>
                </div>
            </footer>
        </div>
    );
}
