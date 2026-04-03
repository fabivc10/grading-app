import { getDb } from "../../../shared/lib/db";
import type { LocalAccessRecord } from "../types";

export async function findLocalAccessByUserId(userId: number): Promise<LocalAccessRecord | null> {
    const db = await getDb();
    const rows = await db.select<LocalAccessRecord[]>(
        "SELECT * FROM local_access_guard WHERE user_id = ? LIMIT 1",
        [userId]
    );
    return rows[0] ?? null;
}

export async function upsertLocalAccess(record: LocalAccessRecord): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO local_access_guard (
            user_id, access_code, account_active, last_payment_date, next_payment_date, last_access_date, blocked_reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            access_code = excluded.access_code,
            account_active = excluded.account_active,
            last_payment_date = excluded.last_payment_date,
            next_payment_date = excluded.next_payment_date,
            last_access_date = excluded.last_access_date,
            blocked_reason = excluded.blocked_reason,
            updated_at = excluded.updated_at`,
        [
            record.user_id,
            record.access_code,
            record.account_active,
            record.last_payment_date,
            record.next_payment_date,
            record.last_access_date,
            record.blocked_reason,
            record.updated_at,
        ]
    );
}
