import { getDb } from "../../shared/lib/db";
import type { InstitutionDTO, CreateInstitutionDTO } from "./types";

export async function findAll(): Promise<InstitutionDTO[]> {
    const db = await getDb();
    return db.select<InstitutionDTO[]>("SELECT * FROM institutions ORDER BY id");
}

export async function create(data: CreateInstitutionDTO): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
        "INSERT INTO institutions (name, code, address) VALUES (?, ?, ?)",
        [data.name, data.code, data.address ?? null]
    );
    return result.lastInsertId as number;
}
