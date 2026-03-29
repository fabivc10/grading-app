import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { isTauri } from "@tauri-apps/api/core";
import { ensureInstitutionForUser } from "../../../../shared/lib/db";
import {
    downloadProfilePicture,
    readProfilePicture,
    saveProfilePicture,
} from "../../../profile/repositories/profile-picture.repository";
import * as localAuthRepo from "../../repositories/auth-user.repository";
import type { AuthProvider, User, UserDTO } from "../../types";
import { getPasswordShadowHash } from "./auth-config";

type OAuthProgressReporter = (step: string) => void;

const OAUTH_STEP_TIMEOUT_MS = 15_000;

function isLocalFilePath(value: string) {
    return !value.startsWith("data:") && !value.startsWith("http://") && !value.startsWith("https://");
}

async function resolveAvatarData(avatarData: string | null): Promise<string | undefined> {
    if (!avatarData) return undefined;
    if (!isLocalFilePath(avatarData)) return avatarData;
    if (!isTauri()) return undefined;
    return (await readProfilePicture(avatarData)) ?? undefined;
}

async function toModel(userDto: Pick<UserDTO, "id" | "email" | "name" | "avatar_data" | "auth_provider">): Promise<User> {
    return {
        id: userDto.id,
        email: userDto.email,
        name: userDto.name,
        provider: userDto.auth_provider ?? "email",
        avatarData: await resolveAvatarData(userDto.avatar_data),
    };
}

function getDisplayName(user: SupabaseAuthUser) {
    const meta = user.user_metadata;
    const candidates = [
        meta?.full_name,
        meta?.name,
        meta?.preferred_username,
        user.email?.split("@")[0],
        "Usuario OAuth",
    ];
    return String(candidates.find((value) => typeof value === "string" && value.trim()) ?? "Usuario OAuth").trim();
}

function getOAuthEmail(user: SupabaseAuthUser): string | null {
    const meta = user.user_metadata;
    const identityData = user.identities?.flatMap((identity) => {
        const data = identity.identity_data;
        if (!data || typeof data !== "object") return [];
        const emails = Array.isArray((data as { emails?: unknown }).emails)
            ? (data as { emails: unknown[] }).emails.filter((value): value is string => typeof value === "string")
            : [];
        return [
            typeof data.email === "string" ? data.email : null,
            typeof data.email_address === "string" ? data.email_address : null,
            typeof data.preferred_username === "string" ? data.preferred_username : null,
            typeof (data as { mail?: unknown }).mail === "string" ? (data as { mail: string }).mail : null,
            typeof (data as { upn?: unknown }).upn === "string" ? (data as { upn: string }).upn : null,
            typeof (data as { userPrincipalName?: unknown }).userPrincipalName === "string"
                ? (data as { userPrincipalName: string }).userPrincipalName
                : null,
            ...emails,
        ];
    }) ?? [];

    const candidates = [
        user.email,
        typeof meta?.email === "string" ? meta.email : null,
        typeof meta?.preferred_username === "string" ? meta.preferred_username : null,
        typeof meta?.email_address === "string" ? meta.email_address : null,
        typeof meta?.mail === "string" ? meta.mail : null,
        typeof meta?.upn === "string" ? meta.upn : null,
        typeof meta?.userPrincipalName === "string" ? meta.userPrincipalName : null,
        ...identityData,
    ];

    const resolved = candidates.find((value) => typeof value === "string" && value.trim());
    return typeof resolved === "string" ? resolved.trim().toLowerCase() : null;
}

function getFallbackOAuthEmail(provider: AuthProvider, user: SupabaseAuthUser): string | null {
    if (provider !== "outlook") return null;
    return `${user.id}@outlook.oauth.local`;
}

function getOAuthProfileImageUrl(user: SupabaseAuthUser): string | null {
    const meta = user.user_metadata;
    const candidates = [meta?.avatar_url, meta?.picture, meta?.photo_url];
    const value = candidates.find((item) => typeof item === "string" && item.trim());
    return typeof value === "string" ? value.trim() : null;
}

export function inferOAuthProvider(user: SupabaseAuthUser): Extract<User["provider"], "google" | "outlook"> {
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

async function withOAuthTimeout<T>(
    label: string,
    task: () => Promise<T>,
    onProgress?: OAuthProgressReporter,
): Promise<T> {
    reportOAuthProgress(onProgress, label);

    let timeoutId = 0;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            reject(new Error(`Tiempo agotado en OAuth: ${label}`));
        }, OAUTH_STEP_TIMEOUT_MS);
    });

    try {
        return await Promise.race([task(), timeoutPromise]);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function persistOAuthAvatar(
    sbUser: SupabaseAuthUser,
    oldPath: string | null
): Promise<string | null> {
    const imageUrl = getOAuthProfileImageUrl(sbUser);
    if (!imageUrl || !isTauri()) return oldPath;

    try {
        return await downloadProfilePicture(`user-${sbUser.id}`, imageUrl, oldPath ?? undefined);
    } catch {
        return oldPath;
    }
}

export async function syncSupabaseAuthUser(
    sbUser: SupabaseAuthUser,
    provider: AuthProvider,
    onProgress?: OAuthProgressReporter
): Promise<User | null> {
    const normalizedEmail = getOAuthEmail(sbUser) ?? getFallbackOAuthEmail(provider, sbUser);
    if (!normalizedEmail) return null;

    const avatarPath = await withOAuthTimeout(
        "Preparando datos locales del perfil...",
        () => persistOAuthAvatar(sbUser, null),
        onProgress
    );
    const displayName = getDisplayName(sbUser);

    const existingByExternal = await withOAuthTimeout(
        "Buscando usuario local vinculado...",
        () => localAuthRepo.findUserByExternalAuth(provider, sbUser.id),
        onProgress
    );
    if (existingByExternal) {
        const nextAvatarPath = await withOAuthTimeout(
            "Preparando datos locales del perfil...",
            () => persistOAuthAvatar(sbUser, existingByExternal.avatar_data),
            onProgress
        );
        if (nextAvatarPath !== existingByExternal.avatar_data) {
            await withOAuthTimeout(
                "Actualizando perfil local...",
                () => localAuthRepo.updateUserAvatar(existingByExternal.id, nextAvatarPath),
                onProgress
            );
            existingByExternal.avatar_data = nextAvatarPath;
        }
        if (provider === "email" && existingByExternal.hash !== getPasswordShadowHash(sbUser.id)) {
            await withOAuthTimeout(
                "Actualizando credenciales locales...",
                () => localAuthRepo.updateUserPassword(existingByExternal.id, getPasswordShadowHash(sbUser.id)),
                onProgress
            );
        }
        await withOAuthTimeout(
            "Verificando institucion inicial...",
            () => ensureInstitutionForUser(existingByExternal.id, existingByExternal.name),
            onProgress
        );
        return withOAuthTimeout(
            "Cargando perfil final...",
            () => toModel(existingByExternal),
            onProgress
        );
    }

    const existingByEmail = await withOAuthTimeout(
        "Buscando usuario local por correo...",
        () => localAuthRepo.findUserByEmail(normalizedEmail),
        onProgress
    );
    if (existingByEmail) {
        await withOAuthTimeout(
            "Vinculando cuenta existente...",
            () => localAuthRepo.linkUserToExternalAuth(existingByEmail.id, provider, sbUser.id),
            onProgress
        );
        const nextAvatarPath = await withOAuthTimeout(
            "Preparando datos locales del perfil...",
            () => persistOAuthAvatar(sbUser, existingByEmail.avatar_data),
            onProgress
        );
        if (nextAvatarPath !== existingByEmail.avatar_data) {
            await withOAuthTimeout(
                "Actualizando perfil local...",
                () => localAuthRepo.updateUserAvatar(existingByEmail.id, nextAvatarPath),
                onProgress
            );
        }
        if (provider === "email" && existingByEmail.hash !== getPasswordShadowHash(sbUser.id)) {
            await withOAuthTimeout(
                "Actualizando credenciales locales...",
                () => localAuthRepo.updateUserPassword(existingByEmail.id, getPasswordShadowHash(sbUser.id)),
                onProgress
            );
        }
        await withOAuthTimeout(
            "Verificando institucion inicial...",
            () => ensureInstitutionForUser(existingByEmail.id, existingByEmail.name),
            onProgress
        );
        const linked = await withOAuthTimeout(
            "Recargando usuario local vinculado...",
            () => localAuthRepo.findUserById(existingByEmail.id),
            onProgress
        );
        return linked
            ? withOAuthTimeout(
                "Cargando perfil final...",
                () => toModel(linked),
                onProgress
            )
            : null;
    }

    const created = await withOAuthTimeout(
        "Creando usuario local...",
        () => localAuthRepo.createAuthUser(
            normalizedEmail,
            displayName,
            getPasswordShadowHash(sbUser.id),
            provider,
            sbUser.id,
            avatarPath
        ),
        onProgress
    );
    if (created) {
        await withOAuthTimeout(
            "Creando institucion inicial...",
            () => ensureInstitutionForUser(created.id, created.name),
            onProgress
        );
    }
    return created
        ? withOAuthTimeout(
            "Cargando perfil final...",
            () => toModel(created),
            onProgress
        )
        : null;
}

export async function fetchUserById(id: number): Promise<User | null> {
    const userDto = await localAuthRepo.findUserById(id);
    if (userDto) {
        await ensureInstitutionForUser(userDto.id, userDto.name);
    }
    return userDto ? toModel(userDto) : null;
}

async function getPersistedAvatarValue(id: number, avatarData?: string): Promise<string | null> {
    const current = await localAuthRepo.findUserById(id);
    const currentStored = current?.avatar_data ?? null;

    if (!avatarData) {
        return currentStored;
    }

    const currentResolved = await resolveAvatarData(currentStored);
    if (avatarData === currentResolved) {
        return currentStored;
    }

    if (avatarData.startsWith("data:") && isTauri()) {
        return saveProfilePicture(`user-${id}`, avatarData, currentStored ?? undefined);
    }

    return avatarData;
}

export async function updateProfile(id: number, name: string, avatarData?: string): Promise<User | null> {
    const persistedAvatar = await getPersistedAvatarValue(id, avatarData);
    await localAuthRepo.updateUserProfile(id, name.trim(), persistedAvatar);
    return fetchUserById(id);
}
