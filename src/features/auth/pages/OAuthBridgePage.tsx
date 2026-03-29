import { useEffect, useMemo, useState } from "react";
import styles from "./OAuthBridgePage.module.css";

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

    const [message, setMessage] = useState("Estamos abriendo Grading App automaticamente.");

    useEffect(() => {
        document.title = "Grading App";
    }, []);

    useEffect(() => {
        if (!hasOAuthPayload) {
            setMessage("No encontramos informacion valida de autenticacion en este callback.");
            return;
        }

        window.location.assign(deepLinkTarget);

        const timer = window.setTimeout(() => {
            setMessage("Si la app principal ya esta visible, vuelve a Grading App y cierra esta pestana.");
        }, 1500);

        return () => {
            window.clearTimeout(timer);
        };
    }, [deepLinkTarget, hasOAuthPayload]);

    return (
        <main className={styles.page}>
            <div className={styles.backgroundGlow} aria-hidden="true" />
            <section className={styles.card}>
                <div className={styles.hero}>
                    <div className={styles.logoFrame}>
                        <img src="/icon.png" alt="Grading App" className={styles.logoIcon} />
                    </div>

                    <span className={styles.statusPill}>
                        {hasOAuthPayload ? "Acceso completado" : "Callback incompleto"}
                    </span>

                    <h1 className={styles.title}>Grading App</h1>
                    <p className={styles.subtitle}>
                        {hasOAuthPayload
                            ? "La autenticacion se completo correctamente."
                            : "No pudimos confirmar el acceso desde esta pagina."}
                    </p>
                </div>

                <div className={styles.infoPanel}>
                    <section className={styles.infoSection}>
                        <p className={styles.sectionLabel}>Estado actual</p>
                        <p className={styles.messageText}>{message}</p>
                    </section>

                    <section className={styles.infoSection}>
                        <p className={styles.sectionLabel}>Siguiente paso</p>
                        <p className={styles.noteText}>
                            {hasOAuthPayload
                                ? "Vuelve a Grading App para continuar. Esta pagina no requiere ninguna accion adicional."
                                : "Regresa a Grading App e intenta el inicio de sesion nuevamente."}
                        </p>
                    </section>
                </div>

                <div className={styles.noticeBar}>
                    Esta pagina solo confirma el acceso. Puedes cerrarla despues de volver a la app.
                </div>
            </section>
        </main>
    );
}
