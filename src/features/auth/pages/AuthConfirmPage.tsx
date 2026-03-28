import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeEmailConfirmation } from "../services/auth.service";
import styles from "./LoginPage.module.css";

export function AuthConfirmPage() {
    const navigate = useNavigate();
    const [message, setMessage] = useState("Confirmando tu cuenta...");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const err = await completeEmailConfirmation(window.location.href);
                if (cancelled) return;
                if (err) {
                    setError(err);
                    setMessage("");
                    return;
                }
                setMessage("Cuenta confirmada. Entrando a Grading App...");
                window.setTimeout(() => navigate("/app", { replace: true }), 900);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "No fue posible confirmar tu cuenta.");
                setMessage("");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [completeEmailConfirmation, navigate]);

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>G</div>
                    <h1>Confirmando cuenta</h1>
                    <p>Estamos validando tu enlace de registro.</p>
                </div>

                {message && <p className={styles.helper}>{message}</p>}
                {error && <p className={styles.error}>{error}</p>}
            </div>
        </div>
    );
}
