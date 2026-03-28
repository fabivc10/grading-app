import * as repo from "../repositories/institution.repository";
import type { Institution, InstitutionDTO } from "../types";
import { deleteInstitutionIcon, saveInstitutionIcon } from "../repositories/institution-icon.repository";

function toModel(dto: InstitutionDTO): Institution {
    return {
        id:               dto.id,
        name:             dto.name,
        code:             dto.code,
        address:          dto.address          ?? undefined,
        tipoInstitucion:  dto.tipo_institucion  ?? undefined,
        direccionRegional:dto.direccion_regional ?? undefined,
        circuito:         dto.circuito          ?? undefined,
        iconPath:         dto.icon_path         ?? undefined,
    };
}

export async function fetchInstitutionsByOwner(ownerUserId: number): Promise<Institution[]> {
    const rows = await repo.findAllByOwner(ownerUserId);
    return rows.map(toModel);
}

export async function updateInstitution(id: number, data: Omit<Institution, "id">, oldIconPath?: string): Promise<Institution> {
    const iconPath = data.iconPath && data.iconPath.startsWith("data:")
        ? await saveInstitutionIcon(data.code, data.iconPath, oldIconPath)
        : data.iconPath;

    await repo.update(id, {
        name:               data.name,
        code:               data.code,
        address:            data.address            ?? null,
        tipo_institucion:   data.tipoInstitucion    ?? null,
        direccion_regional: data.direccionRegional  ?? null,
        circuito:           data.circuito           ?? null,
        icon_path:          iconPath                ?? null,
    });

    return { id, ...data, iconPath };
}

export async function deleteInstitution(id: number, iconPath?: string): Promise<void> {
    await repo.remove(id);
    await deleteInstitutionIcon(iconPath);
}

export async function insertInstitution(ownerUserId: number, data: Omit<Institution, "id">): Promise<Institution> {
    const iconPath = data.iconPath && data.iconPath.startsWith("data:")
        ? await saveInstitutionIcon(data.code, data.iconPath, undefined)
        : data.iconPath;

    const id = await repo.create({
        owner_user_id:      ownerUserId,
        name:               data.name,
        code:               data.code,
        address:            data.address            ?? null,
        tipo_institucion:   data.tipoInstitucion    ?? null,
        direccion_regional: data.direccionRegional  ?? null,
        circuito:           data.circuito           ?? null,
        icon_path:          iconPath                ?? null,
    });
    return { id, ...data, iconPath };
}
