// ─── DTOs (raw DB row shapes) ─────────────────────────────────────────────────
export type InstitutionDTO = {
    id: number;
    name: string;
    code: string;
    address: string | null;
};

export type CreateInstitutionDTO = Omit<InstitutionDTO, "id">;

// ─── Models (domain objects used in the app) ──────────────────────────────────
export type Institution = {
    id: number;
    name: string;
    code: string;
    address?: string;
};
