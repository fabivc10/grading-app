import { getDb } from "../../../shared/lib/db";

type AuthSessionRow = {
    user_id: number | null;
};

function nowIso() {
    return new Date().toISOString();
}

export async function findActiveSessionUserId(): Promise<number | null> {
    const db = await getDb();
    const rows = await db.select<AuthSessionRow[]>(
        "SELECT user_id FROM auth_session WHERE id = 1 LIMIT 1"
    );
    return rows[0]?.user_id ?? null;
}

export async function setActiveSessionUserId(userId: number): Promise<void> {
    const db = await getDb();
    const timestamp = nowIso();
    await db.execute(
        `INSERT INTO auth_session (id, user_id, created_at, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            updated_at = excluded.updated_at`,
        [userId, timestamp, timestamp]
    );
}

export async function clearActiveSession(): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE auth_session SET user_id = NULL, updated_at = ? WHERE id = 1",
        [nowIso()]
    );
}
