import { getDb } from "../../shared/lib/db";

export async function loadAllSettings(institutionId: number): Promise<Record<string, string>> {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings WHERE institution_id = ?",
        [institutionId]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function saveSetting(institutionId: number, key: string, value: unknown): Promise<void> {
    const db = await getDb();
    await db.execute(
        "INSERT INTO settings (institution_id, key, value) VALUES (?,?,?) ON CONFLICT(institution_id, key) DO UPDATE SET value = excluded.value",
        [institutionId, key, JSON.stringify(value)]
    );
}
