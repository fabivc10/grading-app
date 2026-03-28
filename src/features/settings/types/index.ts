import type { NivelConfig } from "../../evaluations/types";

export type Umbral = {
    id: string;
    valor: number;
    dir: "<" | ">";
    color: string;
};

export type RangoEval = {
    min: number;
    max: number;
};

export type EvalScale = {
    id: string;
    label: string;
    min: number;
    max: number;
};

export type ConfiguracionDraft = {
    duracionLeccion: number;
    defaultLecciones: number;
    unjustifiedAbsencesPerFault: number;
    tardiesPerFault: number;
    umbralPromedio: Umbral[];
    umbralAusencias: Umbral[];
    nivelConfigs: Record<string, NivelConfig>;
    evalScales: EvalScale[];
};
