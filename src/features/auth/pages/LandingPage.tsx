import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store";
import styles from "./LandingPage.module.css";

function LoadingOverlay({ exiting }: { exiting: boolean }) {
    return (
        <div className={`${styles.overlay}${exiting ? ` ${styles.exit}` : ""}`}>
            <div className={styles.overlayLogo}>
                <img src="/icon.png" alt="Grading App" className={styles.overlayLogoImage} />
                <div className={styles.overlaySpinner} />
            </div>
            <p className={styles.overlayText}>Preparando tu espacio...</p>
            <div className={styles.progressTrack}>
                <div className={styles.progressBar} />
            </div>
        </div>
    );
}

export function LandingPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const exitTimer = window.setTimeout(() => setExiting(true), 1650);
        const navTimer = window.setTimeout(() => {
            navigate(user ? "/app" : "/login", { replace: true });
        }, 2000);

        return () => {
            window.clearTimeout(exitTimer);
            window.clearTimeout(navTimer);
        };
    }, [navigate, user]);

    return <LoadingOverlay exiting={exiting} />;
}
