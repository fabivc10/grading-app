import type { NivelConfig } from "../../evaluations/types";
import type { EvalScale, RangoEval, Umbral } from "../types";

export const COLORES_PRESET = [
    "#ef4444", "#f97316", "#eab308", "#84cc16",
    "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6",
];

export const BASE_PROMEDIO_COLOR = "#ef4444";
export const AUSENCIAS_SEGMENT_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#7f1d1d"];

export const DEFAULT_UMBRAL_PROMEDIO: Umbral[] = [
    { id: "p1", valor: 65, dir: "<", color: "#f97316" },
    { id: "p2", valor: 70, dir: "<", color: "#eab308" },
    { id: "p3", valor: 80, dir: "<", color: "#22c55e" },
    { id: "p4", valor: 90, dir: "<", color: "#3b82f6" },
];

export const DEFAULT_UMBRAL_AUSENCIAS: Umbral[] = [
    { id: "a1", valor: 10, dir: ">", color: "" },
    { id: "a2", valor: 20, dir: ">", color: "" },
    { id: "a3", valor: 30, dir: ">", color: "" },
];

export const DEFAULT_NIVEL_CONFIG: NivelConfig = {
    cotidiano: 20, tareas: 20, numTareas: 5,
    prueba: 40, numPruebas: 3,
    proyecto: 10, numProyectos: 1,
    asistencia: 10,
};

export const DEFAULT_RANGO_NUMERICA: RangoEval = { min: 1, max: 5 };
export const DEFAULT_RANGO_ANALITICA: RangoEval = { min: 1, max: 3 };

export const DEFAULT_EVAL_SCALES: EvalScale[] = [
    { id: "numerica", label: "Numerica", min: DEFAULT_RANGO_NUMERICA.min, max: DEFAULT_RANGO_NUMERICA.max },
    { id: "analitica", label: "Analitica", min: DEFAULT_RANGO_ANALITICA.min, max: DEFAULT_RANGO_ANALITICA.max },
];
