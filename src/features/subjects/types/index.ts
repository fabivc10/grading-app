export type AsignaturaDTO = {
    id: string;
    institution_id: number;
    year: number;
    nombre: string;
    grupo: string;
    seccion: string;
    lecciones: number;
    created_at: string;
};

export type SemestreDTO = {
    id: string;
    asignatura_id: string;
    nombre: string;
};

export type Semestre = { id: string; nombre: string };

export type Asignatura = {
    id: string;
    year: number;
    nombre: string;
    grupo: number;
    seccion: number;
    lecciones: number;
    semestres: [Semestre, Semestre];
    created_at: string;
};

export type AsignaturaFormData = {
    year: number;
    nombre: string;
    grupo: number;
    seccion: number;
    lecciones: number;
};
