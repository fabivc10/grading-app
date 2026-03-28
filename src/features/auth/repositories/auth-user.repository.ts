import { getDb } from "../../../shared/lib/db";
import type { AuthProvider, UserDTO } from "../types";

export async function findUserByEmail(email: string): Promise<UserDTO | null> {
    const db = await getDb();
    const rows = await db.select<UserDTO[]>(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [email]
    );
    return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserDTO | null> {
    const db = await getDb();
    const rows = await db.select<UserDTO[]>(
        "SELECT * FROM users WHERE id = ? LIMIT 1",
        [id]
    );
    return rows[0] ?? null;
}

export async function findUserByExternalAuth(
    provider: AuthProvider,
    externalAuthId: string
): Promise<UserDTO | null> {
    const db = await getDb();
    const rows = await db.select<UserDTO[]>(
        "SELECT * FROM users WHERE auth_provider = ? AND external_auth_id = ? LIMIT 1",
        [provider, externalAuthId]
    );
    return rows[0] ?? null;
}

export async function updateUserProfile(id: number, name: string, avatarData: string | null): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE users SET name = ?, avatar_data = ? WHERE id = ?",
        [name, avatarData, id]
    );
}

export async function updateUserAvatar(id: number, avatarData: string | null): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE users SET avatar_data = ? WHERE id = ?",
        [avatarData, id]
    );
}

export async function updateUserPassword(id: number, hash: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE users SET hash = ? WHERE id = ?",
        [hash, id]
    );
}

export async function createOAuthUser(
    email: string,
    name: string,
    provider: AuthProvider,
    externalAuthId: string,
    avatarData: string | null
): Promise<UserDTO | null> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO users (email, name, hash, auth_provider, external_auth_id, avatar_data) VALUES (?, ?, ?, ?, ?, ?)",
        [email, name, `oauth:${provider}:${externalAuthId}`, provider, externalAuthId, avatarData]
    );
    return findUserByEmail(email);
}

export async function createAuthUser(
    email: string,
    name: string,
    hash: string,
    provider: AuthProvider,
    externalAuthId: string | null,
    avatarData: string | null
): Promise<UserDTO | null> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO users (email, name, hash, auth_provider, external_auth_id, avatar_data) VALUES (?, ?, ?, ?, ?, ?)",
        [email, name, hash, provider, externalAuthId, avatarData]
    );
    return findUserByEmail(email);
}

export async function linkUserToExternalAuth(
    id: number,
    provider: AuthProvider,
    externalAuthId: string
): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE users SET auth_provider = ?, external_auth_id = ? WHERE id = ?",
        [provider, externalAuthId, id]
    );
}
