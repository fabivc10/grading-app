import { getDb } from "../../shared/lib/db";
import type { UserDTO } from "./types";

export async function findUserByEmail(email: string): Promise<UserDTO | null> {
    const db = await getDb();
    const rows = await db.select<UserDTO[]>(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [email]
    );
    return rows[0] ?? null;
}
