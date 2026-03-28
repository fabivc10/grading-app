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
    provider: AuthProvider
): Promise<User | null> {
    const normalizedEmail = getOAuthEmail(sbUser) ?? getFallbackOAuthEmail(provider, sbUser);
    if (!normalizedEmail) return null;

    const avatarPath = await persistOAuthAvatar(sbUser, null);
    const displayName = getDisplayName(sbUser);

    const existingByExternal = await localAuthRepo.findUserByExternalAuth(provider, sbUser.id);
    if (existingByExternal) {
        const nextAvatarPath = await persistOAuthAvatar(sbUser, existingByExternal.avatar_data);
        if (nextAvatarPath !== existingByExternal.avatar_data) {
            await localAuthRepo.updateUserAvatar(existingByExternal.id, nextAvatarPath);
            existingByExternal.avatar_data = nextAvatarPath;
        }
        if (provider === "email" && existingByExternal.hash !== getPasswordShadowHash(sbUser.id)) {
            await localAuthRepo.updateUserPassword(existingByExternal.id, getPasswordShadowHash(sbUser.id));
        }
        await ensureInstitutionForUser(existingByExternal.id, existingByExternal.name);
        return toModel(existingByExternal);
    }

    const existingByEmail = await localAuthRepo.findUserByEmail(normalizedEmail);
    if (existingByEmail) {
        await localAuthRepo.linkUserToExternalAuth(existingByEmail.id, provider, sbUser.id);
        const nextAvatarPath = await persistOAuthAvatar(sbUser, existingByEmail.avatar_data);
        if (nextAvatarPath !== existingByEmail.avatar_data) {
            await localAuthRepo.updateUserAvatar(existingByEmail.id, nextAvatarPath);
        }
        if (provider === "email" && existingByEmail.hash !== getPasswordShadowHash(sbUser.id)) {
            await localAuthRepo.updateUserPassword(existingByEmail.id, getPasswordShadowHash(sbUser.id));
        }
        await ensureInstitutionForUser(existingByEmail.id, existingByEmail.name);
        const linked = await localAuthRepo.findUserById(existingByEmail.id);
        return linked ? toModel(linked) : null;
    }

    const created = await localAuthRepo.createAuthUser(
        normalizedEmail,
        displayName,
        getPasswordShadowHash(sbUser.id),
        provider,
        sbUser.id,
        avatarPath
    );
    if (created) {
        await ensureInstitutionForUser(created.id, created.name);
    }
    return created ? toModel(created) : null;
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
