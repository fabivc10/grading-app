import "./assets/styles/app.css";
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { RouterProvider } from "react-router-dom";
import { useAuthStore } from "./features/auth/store";
import { router } from "./app/router";
import { Providers } from "./app/providers";
import {
    ensureNativeOAuthRegistration,
    NATIVE_OAUTH_REDIRECT_URL,
} from "./features/auth/services/shared/auth-config";

const PENDING_DEEP_LINK_KEY = "grading.pending_deep_link";

type SingleInstancePayload = {
    args?: string[];
    cwd?: string;
};

export default function App() {
    const user = useAuthStore((s) => s.user);
    const isExternalBridgeRoute =
        !isTauri() &&
        (window.location.pathname === "/oauth/callback" || window.location.pathname === "/auth/confirm");

    useEffect(() => {
        if (!isTauri()) return;

        let cancelled = false;
        let unlisten: (() => void) | undefined;
        let unlistenSingleInstance: (() => void) | undefined;
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

        const findOAuthDeepLink = (candidates: string[] | undefined) =>
            candidates?.find((value) => value.startsWith(NATIVE_OAUTH_REDIRECT_URL));

        void (async () => {
            try {
                await ensureNativeOAuthRegistration();

                const urls = await getCurrent();
                const currentUrl = findOAuthDeepLink(urls ?? undefined);
                if (!cancelled && currentUrl) {
                    routeDeepLinkToLogin(currentUrl);
                }

                unlisten = await onOpenUrl((urls) => {
                    const deepLinkUrl = findOAuthDeepLink(urls);
                    if (deepLinkUrl) {
                        routeDeepLinkToLogin(deepLinkUrl);
                    }
                });

                unlistenSingleInstance = await listen<SingleInstancePayload>("single-instance", (event) => {
                    const deepLinkUrl = findOAuthDeepLink(event.payload?.args);
                    if (deepLinkUrl) {
                        routeDeepLinkToLogin(deepLinkUrl);
                    }
                });
            } catch (error) {
                console.error("Deep link listener failed:", error);
            }
        })();

        return () => {
            cancelled = true;
            if (releaseTopTimer) window.clearTimeout(releaseTopTimer);
            if (clearAttentionTimer) window.clearTimeout(clearAttentionTimer);
            if (restoreTitleTimer) window.clearTimeout(restoreTitleTimer);
            if (unlisten) unlisten();
            if (unlistenSingleInstance) unlistenSingleInstance();
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
