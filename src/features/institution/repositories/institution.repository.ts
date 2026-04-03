import { getDb } from "../../../shared/lib/db";
import type { InstitutionDTO, CreateInstitutionDTO, UpdateInstitutionDTO } from "../types";

export async function findAllByOwner(ownerUserId: number): Promise<InstitutionDTO[]> {
    const db = await getDb();
    return db.select<InstitutionDTO[]>(
        "SELECT id, owner_user_id, name, code, address, institution_type as tipo_institucion, regional_office as direccion_regional, circuit as circuito, icon_path FROM institutions WHERE owner_user_id = ? ORDER BY id",
        [ownerUserId]
    );
}

export async function create(data: CreateInstitutionDTO): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
        `INSERT INTO institutions (owner_user_id, name, code, address, institution_type, regional_office, circuit, icon_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.owner_user_id ?? null, data.name, data.code, data.address ?? null,
         data.tipo_institucion ?? null, data.direccion_regional ?? null, data.circuito ?? null, data.icon_path ?? null]
    );
    return result.lastInsertId as number;
}

export async function update(id: number, data: UpdateInstitutionDTO): Promise<void> {
    const db = await getDb();
    await db.execute(
        `UPDATE institutions SET name=?, code=?, address=?, institution_type=?, regional_office=?, circuit=?, icon_path=? WHERE id=?`,
        [data.name, data.code, data.address ?? null,
         data.tipo_institucion ?? null, data.direccion_regional ?? null, data.circuito ?? null, data.icon_path ?? null, id]
    );
}

export async function remove(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM institutions WHERE id=?", [id]);
}
