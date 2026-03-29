import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "../../../shared/lib/supabase";
import type { AuthProvider } from "../types";

type OAuthProgressReporter = (step: string) => void;

function getUrlHashParams(url: URL) {
    return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

function getAuthError(url: URL) {
    const hashParams = getUrlHashParams(url);
    return (
        url.searchParams.get("error_description") ??
        url.searchParams.get("error") ??
        hashParams.get("error_description") ??
        hashParams.get("error")
    );
}

function inferOAuthProvider(user: SupabaseAuthUser): Extract<AuthProvider, "google" | "outlook"> {
    const providerCandidates = [
        user.app_metadata?.provider,
        ...(user.app_metadata?.providers ?? []),
        ...((user.identities ?? []).map((identity) => identity.provider)),
    ];

    const normalized = providerCandidates
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());

    if (normalized.some((value) => value.includes("google"))) {
        return "google";
    }

    if (normalized.some((value) => value.includes("azure") || value.includes("outlook") || value.includes("microsoft"))) {
        return "outlook";
    }

    return "outlook";
}

function reportOAuthProgress(onProgress: OAuthProgressReporter | undefined, step: string) {
    onProgress?.(step);
}

async function applyAuthSession(
    url: URL,
    clearBrowserCode: boolean,
    onProgress?: OAuthProgressReporter
): Promise<void> {
    const hashParams = getUrlHashParams(url);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const code = url.searchParams.get("code");

    reportOAuthProgress(onProgress, "Procesando respuesta del proveedor...");

    if (accessToken && refreshToken) {
        reportOAuthProgress(onProgress, "Guardando sesion OAuth en la app...");
        const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (error) throw error;
    }

    if (!code) return;

    reportOAuthProgress(onProgress, "Intercambiando codigo OAuth...");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    if (clearBrowserCode && !url.href.startsWith("grading-app://")) {
        url.searchParams.delete("code");
        window.history.replaceState({}, document.title, url.pathname);
    }
}

export async function completeOAuthProviderLogin(
    provider: Extract<AuthProvider, "google" | "outlook"> | null | undefined,
    sourceUrl = window.location.href,
    onProgress?: OAuthProgressReporter
) {
    const url = new URL(sourceUrl);
    const authError = getAuthError(url);
    if (authError) {
        throw new Error(authError);
    }

    await applyAuthSession(url, true, onProgress);

    reportOAuthProgress(onProgress, "Consultando usuario autenticado...");
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    return {
        authUser: data.user ?? null,
        provider: data.user ? (provider ?? inferOAuthProvider(data.user)) : null,
    };
}

export async function completeEmailConfirmationProvider(sourceUrl = window.location.href) {
    const url = new URL(sourceUrl);
    const authError = getAuthError(url);
    if (authError) {
        throw new Error(authError);
    }

    await applyAuthSession(url, false);

    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user ?? null;
}

export async function signOutProvider(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error && !error.message.includes("Auth session missing")) {
        throw error;
    }
}
