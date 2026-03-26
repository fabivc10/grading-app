import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NivelConfig } from "../evaluaciones/types";
import * as svc from "./service";
import { useInstitutionStore } from "../institution/store";

export const COLORES_PRESET = [
    "#ef4444", "#f97316", "#eab308", "#84cc16",
    "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6",
];

export type Umbral = {
    id: string;
    valor: number;      // 0–100
    dir: "<" | ">";
    color: string;      // segment color (above this valor, for promedio)
};

// Color of the segment below the first promedio threshold
export const BASE_PROMEDIO_COLOR = "#ef4444";

// Ausencias segment colors (left=good, right=bad)
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

export function getRangoColor(score: number, umbrales: Umbral[]): string {
    const sorted = [...umbrales].sort((a, b) => a.valor - b.valor);
    let color = BASE_PROMEDIO_COLOR;
    for (const u of sorted) {
        if (score >= u.valor) color = u.color || color;
    }
    return color;
}

export const DEFAULT_NIVEL_CONFIG: NivelConfig = {
    cotidiano: 20, tareas: 20, numTareas: 5,
    prueba: 40, numPruebas: 3,
    proyecto: 10, numProyectos: 1,
    asistencia: 10,
};

export type RangoEval = { min: number; max: number };
export const DEFAULT_RANGO_NUMERICA:  RangoEval = { min: 1, max: 5 };
export const DEFAULT_RANGO_ANALITICA: RangoEval = { min: 1, max: 3 };

export type ConfiguracionState = {
    duracionLeccion: number;
    defaultLecciones: number;
    umbralPromedio: Umbral[];
    umbralAusencias: Umbral[];
    nivelConfigs: Record<string, NivelConfig>;
    rangoNumerica:  RangoEval;
    rangoAnalitica: RangoEval;
    setDuracionLeccion: (v: number) => void;
    setDefaultLecciones: (v: number) => void;
    setUmbralPromedio: (u: Umbral[]) => void;
    setUmbralAusencias: (u: Umbral[]) => void;
    setNivelConfig: (key: string, cfg: NivelConfig) => void;
    setRangoNumerica:  (r: RangoEval) => void;
    setRangoAnalitica: (r: RangoEval) => void;
    loadFromDb: (institutionId: number) => Promise<void>;
};

export const useConfiguracionStore = create<ConfiguracionState>()(
    persist(
        (set) => ({
            duracionLeccion: 45,
            defaultLecciones: 30,
            umbralPromedio: DEFAULT_UMBRAL_PROMEDIO,
            umbralAusencias: DEFAULT_UMBRAL_AUSENCIAS,
            nivelConfigs: {},
            rangoNumerica:  DEFAULT_RANGO_NUMERICA,
            rangoAnalitica: DEFAULT_RANGO_ANALITICA,
            setDuracionLeccion: (v) => {
                set({ duracionLeccion: v });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "duracion_leccion", v).catch(console.error);
            },
            setDefaultLecciones: (v) => {
                set({ defaultLecciones: v });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "default_lecciones", v).catch(console.error);
            },
            setUmbralPromedio: (u) => {
                set({ umbralPromedio: u });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "umbral_promedio", u).catch(console.error);
            },
            setUmbralAusencias: (u) => {
                set({ umbralAusencias: u });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "umbral_ausencias", u).catch(console.error);
            },
            setNivelConfig: (key, cfg) => set((s) => {
                const next = { ...s.nivelConfigs, [key]: cfg };
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "nivel_configs", next).catch(console.error);
                return { nivelConfigs: next };
            }),
            setRangoNumerica: (r) => {
                set({ rangoNumerica: r });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "rango_numerica", r).catch(console.error);
            },
            setRangoAnalitica: (r) => {
                set({ rangoAnalitica: r });
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "rango_analitica", r).catch(console.error);
            },
            loadFromDb: async (institutionId) => {
                const raw = await svc.loadAllSettings(institutionId);
                const patch: Record<string, unknown> = {};
                const tryParse = (k: string) => { try { return JSON.parse(raw[k]); } catch { return undefined; } };
                if (raw.umbral_promedio)   patch.umbralPromedio   = tryParse("umbral_promedio");
                if (raw.umbral_ausencias)  patch.umbralAusencias  = tryParse("umbral_ausencias");
                if (raw.duracion_leccion)  patch.duracionLeccion  = tryParse("duracion_leccion");
                if (raw.default_lecciones) patch.defaultLecciones = tryParse("default_lecciones");
                if (raw.rango_numerica)    patch.rangoNumerica    = tryParse("rango_numerica");
                if (raw.rango_analitica)   patch.rangoAnalitica   = tryParse("rango_analitica");
                if (raw.nivel_configs)     patch.nivelConfigs     = tryParse("nivel_configs");
                if (Object.keys(patch).length) set(patch as never);
            },
        }),
        { name: "grading-config" }
    )
);
