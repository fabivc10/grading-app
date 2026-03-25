import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./LandingPage.module.css";

function LoadingOverlay({ exiting }: { exiting: boolean }) {
    return (
        <div className={`${styles.overlay}${exiting ? ` ${styles.exit}` : ""}`}>
            <div className={styles.overlayLogo}>
                <div className={styles.overlayLogoIcon}>G</div>
                <div className={styles.overlaySpinner} />
            </div>
            <p className={styles.overlayText}>Preparando tu espacio...</p>
            <div className={styles.progressTrack}>
                <div className={styles.progressBar} />
            </div>
        </div>
    );
}

function AsignaturasCard() {
    const rows = [
        { label: "Matemáticas II", pct: "78%", color: "#6366f1", score: "9.2" },
        { label: "Ciencias Nat.",  pct: "62%", color: "#8b5cf6", score: "8.5" },
        { label: "Historia",       pct: "85%", color: "#a78bfa", score: "9.7" },
        { label: "Comunicación",   pct: "55%", color: "#6366f1", score: "8.1" },
    ];
    return (
        <div className={styles.mockCard}>
            <div className={styles.mockBar} style={{ background: "linear-gradient(135deg,#3730a3,#4f46e5)" }}>
                <span style={{ background: "#f87171" }} /><span style={{ background: "#fbbf24" }} /><span style={{ background: "#34d399" }} />
                <span className={styles.mockBarTitle}>Asignaturas</span>
            </div>
            <div className={styles.mockBody}>
                {rows.map((r) => (
                    <div className={styles.mockRow} key={r.label}>
                        <span className={styles.mockDot} style={{ background: r.color }} />
                        <span className={styles.mockRowLabel}>{r.label}</span>
                        <div className={styles.mockBar2}><div className={styles.mockBar2Fill} style={{ width: r.pct, background: r.color }} /></div>
                        <span className={styles.mockScore}>{r.score}</span>
                    </div>
                ))}
            </div>
            <div className={styles.cardCaption}>
                <h3>Gestión de asignaturas</h3>
                <p>Seguimiento de progreso por materia en tiempo real</p>
            </div>
        </div>
    );
}

function EstudiantesCard() {
    const rows = [
        { name: "Ana García",    grade: "10.0", stars: 3 },
        { name: "Carlos Pérez",  grade: "9.2",  stars: 3 },
        { name: "María Santos",  grade: "8.8",  stars: 2 },
        { name: "Luis Martínez", grade: "9.5",  stars: 3 },
    ];
    return (
        <div className={styles.mockCard}>
            <div className={styles.mockBar} style={{ background: "linear-gradient(135deg,#065f46,#059669)" }}>
                <span style={{ background: "#f87171" }} /><span style={{ background: "#fbbf24" }} /><span style={{ background: "#34d399" }} />
                <span className={styles.mockBarTitle}>Estudiantes</span>
            </div>
            <div className={styles.mockBody}>
                {rows.map((r) => (
                    <div className={styles.mockRow} key={r.name}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {r.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className={styles.mockRowLabel}>{r.name}</span>
                        <span className={styles.mockScore}>{r.grade}</span>
                        <span style={{ color: "#fbbf24", fontSize: "0.65rem" }}>{"★".repeat(r.stars)}</span>
                    </div>
                ))}
            </div>
            <div className={styles.cardCaption}>
                <h3>Panel de estudiantes</h3>
                <p>Calificaciones, asistencia y desempeño individual</p>
            </div>
        </div>
    );
}

function ReportesCard() {
    const bars   = [40, 65, 55, 80, 70, 90, 75];
    const colors = ["#6366f1","#7c3aed","#8b5cf6","#6366f1","#7c3aed","#8b5cf6","#6366f1"];
    return (
        <div className={styles.mockCard}>
            <div className={styles.mockBar} style={{ background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)" }}>
                <span style={{ background: "#f87171" }} /><span style={{ background: "#fbbf24" }} /><span style={{ background: "#34d399" }} />
                <span className={styles.mockBarTitle}>Reportes</span>
            </div>
            <div className={styles.mockBody}>
                <div className={styles.mockChart}>
                    {bars.map((h, i) => (
                        <div key={i} className={styles.mockChartBar} style={{ height: `${h}%`, background: colors[i] }} />
                    ))}
                </div>
                <div className={styles.mockStat}>
                    <div><div className={styles.mockStatVal}>8.94</div><div className={styles.mockStatLabel}>Promedio general</div></div>
                    <span className={styles.mockTrend}>↑ +12%</span>
                </div>
                <div className={styles.mockRow}>
                    <span className={styles.mockDot} style={{ background: "#6366f1" }} />
                    <span className={styles.mockRowLabel}>Instituciones activas</span>
                    <span className={styles.mockScore}>3</span>
                </div>
            </div>
            <div className={styles.cardCaption}>
                <h3>Reportes y analíticas</h3>
                <p>Visualiza el rendimiento con gráficas y estadísticas</p>
            </div>
        </div>
    );
}

export function LandingPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [exiting, setExiting] = useState(false);

    const goToLogin = () => {
        if (loading) return;
        setLoading(true);
        setTimeout(() => setExiting(true), 1650);
        setTimeout(() => navigate("/login"), 2000);
    };

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach((e) => e.target.classList.add("visible")),
            { threshold: 0.1 }
        );
        document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <>
            {loading && <LoadingOverlay exiting={exiting} />}
            <div className={styles.page}>
                <section className={styles.hero}>
                    <div className={styles.heroContent}>
                        <div className={styles.logoWrap}>
                            <div className={styles.logoGlow} />
                            <div className={styles.logoIcon}>G</div>
                        </div>
                        <h1 className={styles.title}>Grading App</h1>
                        <p className={styles.subtitle}>
                            Plataforma inteligente para la gestión académica: calificaciones,
                            horarios, evaluaciones y mucho más.
                        </p>
                        <div className={styles.ctas}>
                            <button className={styles.ctaPrimary} onClick={goToLogin}>Acceder al sistema</button>
                            <button className={styles.ctaSecondary} onClick={goToLogin}>Primera vez aquí →</button>
                        </div>
                    </div>
                    <div className={styles.scrollHint}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <span>Ver más</span>
                    </div>
                </section>
                <section className={styles.showcase}>
                    <div className={styles.showcaseHeader} data-reveal>
                        <span className={styles.showcaseLabel}>Funcionalidades</span>
                        <h2 className={styles.showcaseTitle}>Todo lo que necesitas en un solo lugar</h2>
                        <p className={styles.showcaseSub}>Diseñado para docentes e instituciones que buscan eficiencia y claridad.</p>
                    </div>
                    <div className={styles.cards} data-reveal>
                        <AsignaturasCard />
                        <EstudiantesCard />
                        <ReportesCard />
                    </div>
                </section>
            </div>
        </>
    );
}
