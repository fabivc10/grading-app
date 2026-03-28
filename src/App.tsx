import "./assets/styles/app.css";
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, isRegistered, onOpenUrl, register } from "@tauri-apps/plugin-deep-link";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { RouterProvider } from "react-router-dom";
import { useAuthStore } from "./features/auth/store";
import { router } from "./app/router";
import { Providers } from "./app/providers";

const NATIVE_LOGIN_PREFIX =
    import.meta.env.VITE_NATIVE_OAUTH_REDIRECT_URL ?? "grading-app://login";
const PENDING_DEEP_LINK_KEY = "grading.pending_deep_link";

export default function App() {
    const user = useAuthStore((s) => s.user);
    const isExternalBridgeRoute =
        !isTauri() &&
        (window.location.pathname === "/oauth/callback" || window.location.pathname === "/auth/confirm");

    useEffect(() => {
        if (!isTauri()) return;

        let cancelled = false;
        let unlisten: (() => void) | undefined;
        let releaseTopTimer: number | undefined;
        let clearAttentionTimer: number | undefined;
        let restoreTitleTimer: number | undefined;

        const bringAppToFront = async () => {
            const appWindow = getCurrentWindow();
            const defaultTitle = "grading-app";

            try {
                await appWindow.show();
            } catch {}

            try {
                await appWindow.unminimize();
            } catch {}

            try {
                await appWindow.setAlwaysOnTop(true);
            } catch {}

            try {
                await appWindow.setFocus();
            } catch {}

            try {
                await appWindow.requestUserAttention(UserAttentionType.Critical);
            } catch {}

            try {
                await appWindow.setTitle("Grading App - abre aqui para continuar");
            } catch {}

            if (releaseTopTimer) {
                window.clearTimeout(releaseTopTimer);
            }
            if (clearAttentionTimer) {
                window.clearTimeout(clearAttentionTimer);
            }
            if (restoreTitleTimer) {
                window.clearTimeout(restoreTitleTimer);
            }

            releaseTopTimer = window.setTimeout(() => {
                void appWindow.setAlwaysOnTop(false).catch(() => {});
            }, 1800);

            clearAttentionTimer = window.setTimeout(() => {
                void appWindow.requestUserAttention(null).catch(() => {});
            }, 6000);

            restoreTitleTimer = window.setTimeout(() => {
                void appWindow.setTitle(defaultTitle).catch(() => {});
            }, 6000);
        };

        const routeDeepLinkToLogin = (url: string) => {
            void bringAppToFront();
            window.sessionStorage.setItem(PENDING_DEEP_LINK_KEY, url);
            const target = `/login?deep_link=${encodeURIComponent(url)}`;
            if (`${window.location.pathname}${window.location.search}` === target) return;
            window.location.replace(target);
        };

        void (async () => {
            try {
                const registered = await isRegistered("grading-app");
                if (!registered) {
                    await register("grading-app");
                }

                const urls = await getCurrent();
                const currentUrl = urls?.find((url) => url.startsWith(NATIVE_LOGIN_PREFIX));
                if (!cancelled && currentUrl) {
                    routeDeepLinkToLogin(currentUrl);
                }

                unlisten = await onOpenUrl((urls) => {
                    const deepLinkUrl = urls.find((url) => url.startsWith(NATIVE_LOGIN_PREFIX));
                    if (deepLinkUrl) {
                        routeDeepLinkToLogin(deepLinkUrl);
                    }
                });
            } catch (error) {
                console.error("[oauth] deep link listener failed:", error);
            }
        })();

        return () => {
            cancelled = true;
            if (releaseTopTimer) window.clearTimeout(releaseTopTimer);
            if (clearAttentionTimer) window.clearTimeout(clearAttentionTimer);
            if (restoreTitleTimer) window.clearTimeout(restoreTitleTimer);
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (isExternalBridgeRoute) return;
        if (!user) return;
        const authRoutes = ["/login", "/auth/confirm", "/oauth/callback"];
        if (authRoutes.includes(window.location.pathname)) {
            window.location.replace("/app");
        }
    }, [isExternalBridgeRoute, user]);

    if (isExternalBridgeRoute) {
        return <RouterProvider router={router} />;
    }

    return (
        <Providers>
            <RouterProvider router={router} />
        </Providers>
    );
}
