// ─── DTOs (raw DB row shapes) ─────────────────────────────────────────────────
export type InstitutionDTO = {
    id: number;
    name: string;
    code: string;
    address: string | null;
    tipo_institucion: string | null;
    direccion_regional: string | null;
    circuito: string | null;
};

export type CreateInstitutionDTO = Omit<InstitutionDTO, "id">;

// ─── Models (domain objects used in the app) ──────────────────────────────────
export type Institution = {
    id: number;
    name: string;
    code: string;
    address?: string;
    tipoInstitucion?: string;
    direccionRegional?: string;
    circuito?: string;
};
