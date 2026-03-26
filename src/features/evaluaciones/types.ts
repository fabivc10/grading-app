// ─── Evaluaciones Types ───────────────────────────────────────────────────────

export type TemaItem = {
    id: string;
    tema: string;        // topic/theme group this punto belongs to
    nombre: string;      // name of this evaluation point
    descripcion: string;
    valor: number;       // max pts this punto is worth
    nota: number;        // earned score (0–valor)
    notaDescripcion: string; // reason/comment for the earned grade
};

export type EvalTipo = "numerica" | "analitica";

export type EvalEntry = {
    id: string;
    nombre: string;
    pct: number;         // max pts allocated from category weight
    semestre: 's1' | 's2';
    tipo: EvalTipo;
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

// Per-nivel (año+grupo) evaluation configuration — replaces the global EvalWeights
export type NivelConfig = {
    cotidiano:    number;  // weight %
    tareas:       number;  // weight %
    numTareas:    number;  // max entries
    prueba:       number;  // weight %
    numPruebas:   number;  // max entries
    proyecto:     number;  // weight % (0 when disabled)
    numProyectos: number;  // max entries (0 = category disabled)
    asistencia:   number;  // weight %
};
