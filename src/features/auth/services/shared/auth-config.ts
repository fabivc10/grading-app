import { isTauri } from "@tauri-apps/api/core";

const NATIVE_OAUTH_REDIRECT_URL =
    import.meta.env.VITE_NATIVE_OAUTH_REDIRECT_URL ?? "grading-app://login";

export function getPasswordShadowHash(supabaseUserId: string) {
    return `supabase:email:${supabaseUserId}`;
}

export function getOAuthRedirectUrl() {
    if (isTauri()) return NATIVE_OAUTH_REDIRECT_URL;

    const explicitRedirect = import.meta.env.VITE_OAUTH_REDIRECT_URL;
    if (explicitRedirect) return explicitRedirect;
    return `${window.location.origin}/login`;
}

export function getEmailRedirectUrl() {
    const explicitRedirect = import.meta.env.VITE_EMAIL_REDIRECT_URL;
    if (explicitRedirect) return explicitRedirect;
    return `${window.location.origin}/auth/confirm`;
}
