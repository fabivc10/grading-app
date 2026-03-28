import { BASE_PROMEDIO_COLOR } from "../constants";
import type { ConfiguracionDraft, Umbral } from "../types";

export function getRangoColor(score: number, umbrales: Umbral[]): string {
    const sorted = [...umbrales].sort((a, b) => a.valor - b.valor);
    let color = BASE_PROMEDIO_COLOR;
    for (const u of sorted) {
        if (score >= u.valor) color = u.color || color;
    }
    return color;
}

export function buildConfiguracionDraft(state: ConfiguracionDraft): ConfiguracionDraft {
    return {
        duracionLeccion: state.duracionLeccion,
        defaultLecciones: state.defaultLecciones,
        unjustifiedAbsencesPerFault: state.unjustifiedAbsencesPerFault,
        tardiesPerFault: state.tardiesPerFault,
        umbralPromedio: state.umbralPromedio,
        umbralAusencias: state.umbralAusencias,
        nivelConfigs: state.nivelConfigs,
        evalScales: state.evalScales,
    };
}
