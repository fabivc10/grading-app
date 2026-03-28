// ─── DTOs (raw DB row shapes) ─────────────────────────────────────────────────
export type InstitutionDTO = {
    id: number;
    owner_user_id: number | null;
    name: string;
    code: string;
    address: string | null;
    tipo_institucion: string | null;
    direccion_regional: string | null;
    circuito: string | null;
    icon_path: string | null;
};

export type CreateInstitutionDTO = Omit<InstitutionDTO, "id">;
export type UpdateInstitutionDTO = Omit<CreateInstitutionDTO, "owner_user_id">;

// ─── Models (domain objects used in the app) ──────────────────────────────────
export type Institution = {
    id: number;
    name: string;
    code: string;
    address?: string;
    tipoInstitucion?: string;
    direccionRegional?: string;
    circuito?: string;
    iconPath?: string;
};
