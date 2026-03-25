// ─── DTOs (raw DB row shapes) ─────────────────────────────────────────────────
export type AsignaturaDTO = {
    id: string;
    institution_id: number;
    año: number;
    nombre: string;
    grupo: string;
    seccion: string;
    lecciones: number;
};

export type SemestreDTO = {
    id: string;
    asignatura_id: string;
    nombre: string;
};

// ─── Models (domain objects used in the app) ──────────────────────────────────
export type Semestre = { id: string; nombre: string };

export type Asignatura = {
    id: string;
    año: number;
    nombre: string;
    grupo: number;
    seccion: number;
    lecciones: number;
    semestres: [Semestre, Semestre];
};

// ─── Input / Form ─────────────────────────────────────────────────────────────
export type AsignaturaFormData = {
    año: number;
    nombre: string;
    grupo: number;
    seccion: number;
    lecciones: number;
};
