import * as repo from "./repository";
import type { Institution, InstitutionDTO } from "./types";

function toModel(dto: InstitutionDTO): Institution {
    return {
        id:               dto.id,
        name:             dto.name,
        code:             dto.code,
        address:          dto.address          ?? undefined,
        tipoInstitucion:  dto.tipo_institucion  ?? undefined,
        direccionRegional:dto.direccion_regional ?? undefined,
        circuito:         dto.circuito          ?? undefined,
    };
}

export async function fetchInstitutions(): Promise<Institution[]> {
    const rows = await repo.findAll();
    return rows.map(toModel);
}

export async function updateInstitution(id: number, data: Omit<Institution, "id">): Promise<void> {
    await repo.update(id, {
        name:               data.name,
        code:               data.code,
        address:            data.address            ?? null,
        tipo_institucion:   data.tipoInstitucion    ?? null,
        direccion_regional: data.direccionRegional  ?? null,
        circuito:           data.circuito           ?? null,
    });
}

export async function deleteInstitution(id: number): Promise<void> {
    await repo.remove(id);
}

export async function insertInstitution(data: Omit<Institution, "id">): Promise<Institution> {
    const id = await repo.create({
        name:               data.name,
        code:               data.code,
        address:            data.address            ?? null,
        tipo_institucion:   data.tipoInstitucion    ?? null,
        direccion_regional: data.direccionRegional  ?? null,
        circuito:           data.circuito           ?? null,
    });
    return { id, ...data };
}
