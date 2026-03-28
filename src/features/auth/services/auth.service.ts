import * as googleProvider from "../providers/google.provider";
import * as microsoftProvider from "../providers/microsoft.provider";
import * as oauthProvider from "../providers/oauth.provider";
import * as passwordProvider from "../providers/password.provider";
import * as userRepo from "../repositories/auth-user.repository";
import { useAccessStore } from "../../access/store";
import { useAuthStore } from "../store";
import type { AuthProvider, User } from "../types";
import { getPasswordShadowHash } from "./shared/auth-config";
import * as authUserService from "./shared/auth-user.service";

const SOCIAL_PROVIDER_KEY = "grading.social_provider";
const PENDING_DEEP_LINK_KEY = "grading.pending_deep_link";

function setAuthenticatedUser(user: User) {
    useAuthStore.getState().setAuth(user);
}

function getCurrentUser() {
    return useAuthStore.getState().user;
}

function rememberActiveProvider(provider: Extract<AuthProvider, "google" | "outlook">) {
    useAuthStore.getState().setActiveProvider(provider);
    if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(PENDING_DEEP_LINK_KEY);
        window.sessionStorage.setItem(SOCIAL_PROVIDER_KEY, provider);
        // localStorage como respaldo para Tauri (sessionStorage puede perderse si la webview se recarga)
        window.localStorage.setItem(SOCIAL_PROVIDER_KEY, provider);
    }
}

function getStoredOAuthProvider(): Extract<AuthProvider, "google" | "outlook"> | null {
    if (typeof window === "undefined") return null;
    const session = window.sessionStorage.getItem(SOCIAL_PROVIDER_KEY);
    if (session === "google" || session === "outlook") return session;
    // Fallback a localStorage para casos donde sessionStorage se perdió (Tauri deep link)
    const local = window.localStorage.getItem(SOCIAL_PROVIDER_KEY);
    if (local === "google" || local === "outlook") return local;
    return null;
}

function clearTransientAuthState() {
    useAuthStore.getState().setActiveProvider(null);
    if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SOCIAL_PROVIDER_KEY);
        window.sessionStorage.removeItem(PENDING_DEEP_LINK_KEY);
        window.localStorage.removeItem(SOCIAL_PROVIDER_KEY);
    }
}

export async function emailExists(email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return false;

    const existingUser = await userRepo.findUserByEmail(normalizedEmail);
    return Boolean(existingUser);
}

export async function loginWithCredentials(
    email: string,
    password: string
): Promise<string | null> {
    const { data, error } = await passwordProvider.signInWithPasswordProvider(
        email.trim().toLowerCase(),
        password
    );
    if (error || !data.user) {
        return "Correo o contrasena incorrectos.";
    }

    const user = await authUserService.syncSupabaseAuthUser(data.user, "email");
    if (!user) {
        return "No fue posible completar el inicio de sesion.";
    }

    setAuthenticatedUser(user);
    return null;
}

export async function registerWithCredentials(
    name: string,
    email: string,
    password: string
): Promise<string | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await passwordProvider.signUpWithPasswordProvider(
        name.trim(),
        normalizedEmail,
        password
    );

    if (error) {
        const normalizedMessage = error.message.trim().toLowerCase();
        if (
            normalizedMessage.includes("already registered") ||
            normalizedMessage.includes("already been registered") ||
            normalizedMessage.includes("user already registered")
        ) {
            return "Este correo ya esta registrado.";
        }
        return error.message;
    }

    if (data.session && data.user) {
        const user = await authUserService.syncSupabaseAuthUser(data.user, "email");
        if (!user) {
            return "No fue posible completar el registro.";
        }
        setAuthenticatedUser(user);
        return null;
    }

    return "Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja y luego vuelve a la app.";
}

export async function signInWithGoogle(): Promise<{ url: string | null; error: string | null }> {
    const result = await googleProvider.signInWithGoogleProvider();
    if (result.url && !result.error) {
        rememberActiveProvider("google");
    }
    return result;
}

export async function signInWithOutlook(): Promise<{ url: string | null; error: string | null }> {
    const result = await microsoftProvider.signInWithMicrosoftProvider();
    if (result.url && !result.error) {
        rememberActiveProvider("outlook");
    }
    return result;
}

export async function completeOAuthLogin(
    provider?: Extract<AuthProvider, "google" | "outlook"> | null,
    sourceUrl?: string
): Promise<string | null> {
    try {
        const resolvedProvider = provider ?? getStoredOAuthProvider();
        const completed = await oauthProvider.completeOAuthProviderLogin(resolvedProvider, sourceUrl);
        if (!completed.authUser || !completed.provider) {
            clearTransientAuthState();
            return "No fue posible completar el inicio de sesion social.";
        }

        const user = await authUserService.syncSupabaseAuthUser(completed.authUser, completed.provider);
        if (!user) {
            clearTransientAuthState();
            return "No fue posible completar el inicio de sesion social.";
        }

        setAuthenticatedUser(user);
        clearTransientAuthState();
        return null;
    } catch (error) {
        clearTransientAuthState();
        throw error;
    }
}

export async function completeEmailConfirmation(sourceUrl?: string): Promise<string | null> {
    const authUser = await oauthProvider.completeEmailConfirmationProvider(sourceUrl);
    if (!authUser) {
        return "No fue posible confirmar el registro.";
    }

    const user = await authUserService.syncSupabaseAuthUser(authUser, "email");
    if (!user) {
        return "No fue posible confirmar el registro.";
    }

    setAuthenticatedUser(user);
    return null;
}

export async function refreshUser(): Promise<void> {
    const current = getCurrentUser();
    if (!current) return;

    const next = await authUserService.fetchUserById(current.id);
    if (next) {
        setAuthenticatedUser(next);
    }
}

export async function updateProfile(name: string, avatarData?: string): Promise<string | null> {
    const current = getCurrentUser();
    if (!current) return "Usuario no autenticado.";

    const next = await authUserService.updateProfile(current.id, name, avatarData);
    if (!next) return "No fue posible actualizar el perfil.";

    setAuthenticatedUser(next);
    return null;
}

export async function changePassword(
    currentPassword: string,
    nextPassword: string
): Promise<string | null> {
    const current = getCurrentUser();
    if (!current) return "Usuario no autenticado.";

    const userDto = await userRepo.findUserById(current.id);
    if (!userDto) return "Usuario no encontrado.";

    const { error: signInError } = await passwordProvider.signInWithPasswordProvider(
        userDto.email,
        currentPassword
    );
    if (signInError) return "La contrasena actual no coincide.";

    const { error } = await passwordProvider.updatePasswordWithProvider(nextPassword);
    if (error) return error.message;

    if (userDto.external_auth_id) {
        await userRepo.updateUserPassword(current.id, getPasswordShadowHash(userDto.external_auth_id));
    }

    return null;
}

export async function logout(): Promise<void> {
    try {
        await oauthProvider.signOutProvider();
    } finally {
        clearTransientAuthState();
        useAccessStore.getState().reset();
        useAuthStore.getState().clearAuth();
    }
}
