import { getDb } from "../../shared/lib/db";
import type { InstitutionDTO, CreateInstitutionDTO } from "./types";

export async function findAll(): Promise<InstitutionDTO[]> {
    const db = await getDb();
    return db.select<InstitutionDTO[]>("SELECT * FROM institutions ORDER BY id");
}

export async function create(data: CreateInstitutionDTO): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
        `INSERT INTO institutions (name, code, address, tipo_institucion, direccion_regional, circuito)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.name, data.code, data.address ?? null,
         data.tipo_institucion ?? null, data.direccion_regional ?? null, data.circuito ?? null]
    );
    return result.lastInsertId as number;
}
