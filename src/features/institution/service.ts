import * as repo from "./repository";
import type { Institution, InstitutionDTO } from "./types";

function toModel(dto: InstitutionDTO): Institution {
    return {
        id:      dto.id,
        name:    dto.name,
        code:    dto.code,
        address: dto.address ?? undefined,
    };
}

export async function fetchInstitutions(): Promise<Institution[]> {
    const rows = await repo.findAll();
    return rows.map(toModel);
}

export async function insertInstitution(data: Omit<Institution, "id">): Promise<Institution> {
    const id = await repo.create({
        name:    data.name,
        code:    data.code,
        address: data.address ?? null,
    });
    return { id, ...data };
}
