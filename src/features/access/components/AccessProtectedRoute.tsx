import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../auth/store";
import { useAccessStore } from "../store";
import styles from "./AccessGate.module.css";

const ACCESS_REDIRECT_KEY = "grading.access_redirect";
const PAYMENTS_ROUTE = "/app/pagos";

function rememberAccessRedirect(path: string) {
    if (typeof window === "undefined") return;
    if (!path || path === PAYMENTS_ROUTE) return;
    window.sessionStorage.setItem(ACCESS_REDIRECT_KEY, path);
}

function consumeAccessRedirect() {
    if (typeof window === "undefined") return "/app";
    const next = window.sessionStorage.getItem(ACCESS_REDIRECT_KEY) || "/app";
    window.sessionStorage.removeItem(ACCESS_REDIRECT_KEY);
    return next;
}

export function AccessProtectedRoute() {
    const location = useLocation();
    const user = useAuthStore((s) => s.user);
    const status = useAccessStore((s) => s.status);
    const checkAccess = useAccessStore((s) => s.checkAccess);
    const reset = useAccessStore((s) => s.reset);

    useEffect(() => {
        if (!user) {
            reset();
            return;
        }
        void checkAccess(user);
    }, [user, checkAccess, reset]);

    if (!user) return null;

    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const isPaymentsRoute = location.pathname === PAYMENTS_ROUTE;

    if (status === "idle" || status === "checking") {
        return (
            <div className={styles.loadingShell}>
                <div className={styles.loadingCard}>
                    <div className={styles.loadingSpinner} />
                    <h1 className={styles.loadingTitle}>Verificando acceso</h1>
                    <p className={styles.loadingText}>Estamos validando el estado de tu cuenta antes de abrir la app.</p>
                </div>
            </div>
        );
    }

    if (status === "granted") {
        if (isPaymentsRoute) {
            return <Navigate to={consumeAccessRedirect()} replace />;
        }
        return <Outlet />;
    }

    if (!isPaymentsRoute) {
        rememberAccessRedirect(currentPath);
        return <Navigate to={PAYMENTS_ROUTE} replace />;
    }

    return <Outlet />;
}
