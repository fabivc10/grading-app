import { useEffect, useMemo, useState } from "react";
import styles from "./LoginPage.module.css";

const NATIVE_LOGIN_PREFIX =
    import.meta.env.VITE_NATIVE_OAUTH_REDIRECT_URL ?? "grading-app://login";

export function OAuthBridgePage() {
    const url = useMemo(() => new URL(window.location.href), []);
    const hasOAuthPayload = useMemo(
        () =>
            url.searchParams.has("code") ||
            url.searchParams.has("error") ||
            url.searchParams.has("error_description") ||
            Boolean(url.hash && url.hash !== "#"),
        [url]
    );
    const deepLinkTarget = useMemo(
        () => `${NATIVE_LOGIN_PREFIX}${url.search}${url.hash}`,
        [url]
    );

    const [message, setMessage] = useState("Redirigiendo a Grading App...");
    const [showManualAction, setShowManualAction] = useState(false);
    const [showCloseHint, setShowCloseHint] = useState(false);

    useEffect(() => {
        if (!hasOAuthPayload) {
            setMessage("No se encontro informacion de autenticacion en este callback.");
            setShowManualAction(false);
            setShowCloseHint(false);
            return;
        }

        // Intentar redirect automático inmediato
        window.location.assign(deepLinkTarget);

        // Fallback: si no redirigió en 1.5s, mostrar el botón manual
        const timer = window.setTimeout(() => {
            setMessage("Haz clic para volver a Grading App.");
            setShowManualAction(true);
        }, 1500);

        return () => {
            window.clearTimeout(timer);
        };
    }, [deepLinkTarget, hasOAuthPayload]);

    const handleOpenApp = () => {
        setMessage("Si Grading App ya se abrio, puedes cerrar esta ventana.");
        setShowCloseHint(true);
        window.location.assign(deepLinkTarget);
    };

    const handleCloseWindow = () => {
        window.open("", "_self");
        window.close();
    };

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>G</div>
                    <h1>Acceso completado</h1>
                    <p>La autenticacion termino correctamente.</p>
                </div>

                <p className={styles.helper}>{message}</p>

                {showManualAction ? (
                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={handleOpenApp}
                        style={{ width: "100%" }}
                    >
                        Volver a Grading App
                    </button>
                ) : null}

                <button
                    type="button"
                    className={styles.providerBtn}
                    onClick={handleCloseWindow}
                    style={{ width: "100%" }}
                >
                    Cerrar esta ventana
                </button>

                {showCloseHint ? (
                    <p className={styles.helper}>
                        Si ya ves la app principal, esta ventana ya no es necesaria.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
