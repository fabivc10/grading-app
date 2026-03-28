export type EstadoAsist = 'P' | 'J' | 'I' | 'T';
export type DayKey = 'l' | 'm' | 'x' | 'j' | 'v';

export type AsistenciaSemana = {
    id: string;
    asignaturaId: string;
    semestre: 's1' | 's2';
    inicioDate: string; // ISO YYYY-MM-DD (Monday)
};

export type AsistenciaDia = {
    id: string;
    semanaId: string;
    estudianteId: string;
    l: EstadoAsist | null;
    m: EstadoAsist | null;
    x: EstadoAsist | null;
    j: EstadoAsist | null;
    v: EstadoAsist | null;
};

export type AsistStudent = {
    id: string;
    nombre_completo: string;
};

/** Global (per-institution) semester date configuration */
export type GlobalSemConfig = {
    s1Start: string; // ISO YYYY-MM-DD or ''
    s1End:   string;
    s2Start: string;
    s2End:   string;
};
