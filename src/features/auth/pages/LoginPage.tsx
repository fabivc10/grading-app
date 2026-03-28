import { FormEvent, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Link, useNavigate } from "react-router-dom";
import {
    completeEmailConfirmation,
    completeOAuthLogin,
    loginWithCredentials,
    signInWithGoogle,
    signInWithOutlook,
} from "../services/auth.service";
import { useAuthStore } from "../store";
import styles from "./LoginPage.module.css";

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const MicrosoftIcon = () => (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.4 2H2v9.4h9.4V2z" fill="#F35325"/>
        <path d="M22 2h-9.4v9.4H22V2z" fill="#81BC06"/>
        <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#05A6F0"/>
        <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#FFBA08"/>
    </svg>
);

const SOCIAL_PROVIDER_KEY = "grading.social_provider";
const NATIVE_LOGIN_PREFIX =
    import.meta.env.VITE_NATIVE_OAUTH_REDIRECT_URL ?? "grading-app://login";
const PENDING_DEEP_LINK_KEY = "grading.pending_deep_link";
const POST_LOGIN_REDIRECT_KEY = "grading.post_login_redirect";

export function LoginPage() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);
    const oauthInFlight = useRef(false);

    const consumePostLoginRedirect = () => {
        const target = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) || "/app";
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        return target;
    };

    const redirectAfterAuth = () => {
        window.location.replace(consumePostLoginRedirect());
    };

    useEffect(() => {
        if (user) {
            navigate("/app", { replace: true });
            return;
        }

        let cancelled = false;
        const browserUrl = new URL(window.location.href);

        const finishOAuth = async (sourceUrl?: string) => {
            if (oauthInFlight.current) return;
            oauthInFlight.current = true;
            setLoading(true);
            setError("");
            setInfo("");
            try {
                const err = await completeOAuthLogin(undefined, sourceUrl);
                if (cancelled) return;
                if (err) {
                    setError(err);
                    return;
                }
                if (sourceUrl && browserUrl.searchParams.has("deep_link")) {
                    window.history.replaceState({}, document.title, browserUrl.pathname);
                }
                redirectAfterAuth();
            } catch (err) {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : "No fue posible iniciar sesión.";
                setError(message);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    oauthInFlight.current = false;
                }
            }
        };

        const deepLinkSource = browserUrl.searchParams.get("deep_link") ?? sessionStorage.getItem(PENDING_DEEP_LINK_KEY);
        const hasBrowserOAuthParams =
            browserUrl.searchParams.has("code") ||
            browserUrl.searchParams.has("error") ||
            browserUrl.searchParams.has("error_description");
        const hasStoredProvider = Boolean(sessionStorage.getItem(SOCIAL_PROVIDER_KEY));

        if (deepLinkSource) {
            void finishOAuth(decodeURIComponent(deepLinkSource));
            return () => {
                cancelled = true;
            };
        }

        if (hasBrowserOAuthParams) {
            if (hasStoredProvider) {
                void finishOAuth();
            } else if (!isTauri()) {
                void (async () => {
                    setLoading(true);
                    setError("");
                    setInfo("");
                    try {
                        const err = await completeEmailConfirmation(window.location.href);
                        if (cancelled) return;
                        if (err) {
                            setError(err);
                            return;
                        }
                        redirectAfterAuth();
                    } catch (err) {
                        if (cancelled) return;
                        setError(err instanceof Error ? err.message : "No fue posible confirmar tu cuenta.");
                    } finally {
                        if (!cancelled) setLoading(false);
                    }
                })();
            } else {
                const deepLinkTarget = `${NATIVE_LOGIN_PREFIX}${browserUrl.search}${browserUrl.hash}`;
                setInfo("Redirigiendo de vuelta a la app de escritorio...");
                window.location.replace(deepLinkTarget);
                window.setTimeout(() => {
                    window.close();
                    document.body.innerHTML = "<div style='font-family: sans-serif; padding: 24px; color: #222;'>Puedes cerrar esta ventana y volver a Grading App.</div>";
                }, 800);
            }
        }

        if (!isTauri()) {
            return () => {
                cancelled = true;
            };
        }

        return () => {
            cancelled = true;
        };
    }, [user, completeOAuthLogin, completeEmailConfirmation, navigate]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setInfo("");
        if (!email || !password) {
            setError("Por favor, completa todos los campos.");
            return;
        }
        setLoading(true);

        try {
            const err = await loginWithCredentials(email, password);
            if (err) {
                setError(err);
                return;
            }
            navigate(consumePostLoginRedirect(), { replace: true });
        } catch (err) {
            console.error("[login] DB error:", err);
            setError("Error al conectar con la base de datos. Intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError("");
        setInfo("");
        setLoading(true);
        try {
            const result = await signInWithGoogle();
            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }
            if (!result.url) {
                setError("No fue posible iniciar el flujo de Google.");
                setLoading(false);
                return;
            }
            if (isTauri()) {
                await openUrl(result.url);
                // En Tauri el usuario ya está en el browser externo — mantener loading hasta que regrese el deep link
                return;
            }
            // En web: mantener loading=true mientras el browser navega al proveedor
            window.location.href = result.url;
        } catch (err) {
            const message = err instanceof Error ? err.message : "No fue posible iniciar sesión con Google.";
            setError(message);
            setLoading(false);
        }
    };

    const handleOutlook = async () => {
        setError("");
        setInfo("");
        setLoading(true);
        try {
            const result = await signInWithOutlook();
            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }
            if (!result.url) {
                setError("No fue posible iniciar el flujo de Outlook.");
                setLoading(false);
                return;
            }
            if (isTauri()) {
                await openUrl(result.url);
                // En Tauri el usuario ya está en el browser externo — mantener loading hasta que regrese el deep link
                return;
            }
            // En web: mantener loading=true mientras el browser navega al proveedor
            window.location.href = result.url;
        } catch (err) {
            const message = err instanceof Error ? err.message : "No fue posible iniciar sesión con Outlook.";
            setError(message);
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <img src="/icon.png" alt="Grading App" className={styles.logoIcon} />
                    <h1>Grading App</h1>
                    <p>Inicia sesión para continuar</p>
                </div>

                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    <div className={styles.field}>
                        <label htmlFor="email">Correo electrónico</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="admin@grading.app"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            disabled={loading}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            disabled={loading}
                        />
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                    {info && <p className={styles.helper}>{info}</p>}
                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                        {loading ? "Verificando..." : "Iniciar sesión"}
                    </button>
                </form>

                <div className={styles.divider}>o continúa con</div>

                <div className={styles.providers}>
                    <button type="button" className={styles.providerBtn} onClick={handleGoogle} disabled={loading}>
                        <GoogleIcon /> Continuar con Google
                    </button>
                    <button type="button" className={styles.providerBtn} onClick={handleOutlook} disabled={loading}>
                        <MicrosoftIcon /> Continuar con Outlook
                    </button>
                </div>

                <p className={styles.authSwitch}>
                    ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
                </p>
            </div>
        </div>
    );
}
