// ─── Evaluaciones Types ───────────────────────────────────────────────────────

export type TemaItem = {
    id: string;
    tema: string;        // topic/theme group this punto belongs to
    nombre: string;      // name of this evaluation point
    descripcion: string;
    valor: number;       // max pts this punto is worth
    nota: number;        // earned score (0–valor)
};

export type EvalEntry = {
    id: string;
    nombre: string;
    pct: number;         // max pts allocated from category weight
    items: TemaItem[];
};

export type SemanaAsist = {
    id: string;
    semana: number;
    dias: boolean[];
};

export type EvalCategory = "cotidiano" | "tareas" | "prueba" | "proyecto";

export type StudentEval = {
    id: string;
    nombre: string;
    asignaturaId: string;
    estudianteId?: string;
    cotidiano: EvalEntry[];
    tareas:    EvalEntry[];
    prueba:    EvalEntry[];
    proyecto:  EvalEntry[];
    asistencia: { s1: SemanaAsist[]; s2: SemanaAsist[] };
};

// Per student — only conducta is global
export type StudentCotidiano = {
    estudianteId: string;
    conductaPct: number;
};

export type EvalWeights = {
    conducta:   number;
    cotidiano:  number;
    tareas:     number;
    prueba:     number;
    proyecto:   number;
    asistencia: number;
};
