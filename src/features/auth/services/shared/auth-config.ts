import { isTauri } from "@tauri-apps/api/core";
import { isRegistered, register } from "@tauri-apps/plugin-deep-link";

export const NATIVE_OAUTH_REDIRECT_URL =
    import.meta.env.VITE_NATIVE_OAUTH_REDIRECT_URL ?? "grading-app://login";

function canUseBrowserOAuthBridge() {
    if (typeof window === "undefined") return false;
    return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function getNativeOAuthScheme() {
    try {
        return new URL(NATIVE_OAUTH_REDIRECT_URL).protocol.replace(":", "");
    } catch {
        return "grading-app";
    }
}

export function getPasswordShadowHash(supabaseUserId: string) {
    return `supabase:email:${supabaseUserId}`;
}

export async function ensureNativeOAuthRegistration() {
    if (!isTauri()) return;

    const scheme = getNativeOAuthScheme();
    const registered = await isRegistered(scheme);
    if (!registered) {
        await register(scheme);
    }
}

export function getOAuthRedirectUrl() {
    const explicitRedirect = import.meta.env.VITE_OAUTH_REDIRECT_URL;
    if (explicitRedirect) return explicitRedirect;

    if (isTauri()) {
        if (canUseBrowserOAuthBridge()) {
            return `${window.location.origin}/oauth/callback`;
        }
        return NATIVE_OAUTH_REDIRECT_URL;
    }

    return `${window.location.origin}/login`;
}

export function getEmailRedirectUrl() {
    const explicitRedirect = import.meta.env.VITE_EMAIL_REDIRECT_URL;
    if (explicitRedirect) return explicitRedirect;
    return `${window.location.origin}/auth/confirm`;
}
