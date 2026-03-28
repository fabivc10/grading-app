import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NivelConfig } from "../../evaluations/types";
import * as svc from "../services/settings.service";
import { useInstitutionStore } from "../../institution/store";
import { DEFAULT_INJUSTIFIED_EQUIVALENCE, DEFAULT_TARDIES_PER_FAULT } from "../../attendance/utils/attendance.utils";
import {
    DEFAULT_EVAL_SCALES,
    DEFAULT_RANGO_ANALITICA,
    DEFAULT_RANGO_NUMERICA,
    DEFAULT_UMBRAL_AUSENCIAS,
    DEFAULT_UMBRAL_PROMEDIO,
} from "../constants";
import type { ConfiguracionDraft, EvalScale, RangoEval, Umbral } from "../types";

export type ConfiguracionState = {
    draftMode: boolean;
    duracionLeccion: number;
    defaultLecciones: number;
    unjustifiedAbsencesPerFault: number;
    tardiesPerFault: number;
    umbralPromedio: Umbral[];
    umbralAusencias: Umbral[];
    nivelConfigs: Record<string, NivelConfig>;
    rangoNumerica: RangoEval;
    rangoAnalitica: RangoEval;
    evalScales: EvalScale[];
    setDuracionLeccion: (v: number) => void;
    setDefaultLecciones: (v: number) => void;
    setUnjustifiedAbsencesPerFault: (v: number) => void;
    setTardiesPerFault: (v: number) => void;
    setUmbralPromedio: (u: Umbral[]) => void;
    setUmbralAusencias: (u: Umbral[]) => void;
    setNivelConfig: (key: string, cfg: NivelConfig) => void;
    setRangoNumerica: (r: RangoEval) => void;
    setRangoAnalitica: (r: RangoEval) => void;
    setEvalScales: (scales: EvalScale[]) => void;
    setDraftMode: (enabled: boolean) => void;
    saveDraft: (draft: ConfiguracionDraft) => Promise<void>;
    loadFromDb: (institutionId: number) => Promise<void>;
};

export const useConfiguracionStore = create<ConfiguracionState>()(
    persist(
        (set) => ({
            draftMode: false,
            duracionLeccion: 45,
            defaultLecciones: 30,
            unjustifiedAbsencesPerFault: DEFAULT_INJUSTIFIED_EQUIVALENCE,
            tardiesPerFault: DEFAULT_TARDIES_PER_FAULT,
            umbralPromedio: DEFAULT_UMBRAL_PROMEDIO,
            umbralAusencias: DEFAULT_UMBRAL_AUSENCIAS,
            nivelConfigs: {},
            rangoNumerica: DEFAULT_RANGO_NUMERICA,
            rangoAnalitica: DEFAULT_RANGO_ANALITICA,
            evalScales: DEFAULT_EVAL_SCALES,

            setDraftMode: (enabled) => set({ draftMode: enabled }),

            setDuracionLeccion: (v) => {
                set({ duracionLeccion: v });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "duracion_leccion", v).catch(console.error);
            },

            setDefaultLecciones: (v) => {
                set({ defaultLecciones: v });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "default_lecciones", v).catch(console.error);
            },

            setUnjustifiedAbsencesPerFault: (v) => {
                const next = Math.max(1, Math.round(v) || DEFAULT_INJUSTIFIED_EQUIVALENCE);
                set({ unjustifiedAbsencesPerFault: next });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "unjustified_absences_per_fault", next).catch(console.error);
            },

            setTardiesPerFault: (v) => {
                const next = Math.max(1, Math.round(v) || DEFAULT_TARDIES_PER_FAULT);
                set({ tardiesPerFault: next });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "tardies_per_fault", next).catch(console.error);
            },

            setUmbralPromedio: (u) => {
                set({ umbralPromedio: u });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "umbral_promedio", u).catch(console.error);
            },

            setUmbralAusencias: (u) => {
                set({ umbralAusencias: u });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "umbral_ausencias", u).catch(console.error);
            },

            setNivelConfig: (key, cfg) => set((s) => {
                const next = { ...s.nivelConfigs, [key]: cfg };
                if (!s.draftMode) {
                    const id = useInstitutionStore.getState().currentId;
                    if (id) svc.saveSetting(id, "nivel_configs", next).catch(console.error);
                }
                return { nivelConfigs: next };
            }),

            setRangoNumerica: (r) => {
                set({ rangoNumerica: r });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "rango_numerica", r).catch(console.error);
            },

            setRangoAnalitica: (r) => {
                set({ rangoAnalitica: r });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "rango_analitica", r).catch(console.error);
            },

            setEvalScales: (scales) => {
                set({ evalScales: scales });
                if (useConfiguracionStore.getState().draftMode) return;
                const id = useInstitutionStore.getState().currentId;
                if (id) svc.saveSetting(id, "eval_scales", scales).catch(console.error);
            },

            saveDraft: async (draft) => {
                const id = useInstitutionStore.getState().currentId;
                set({
                    duracionLeccion: draft.duracionLeccion,
                    defaultLecciones: draft.defaultLecciones,
                    unjustifiedAbsencesPerFault: draft.unjustifiedAbsencesPerFault,
                    tardiesPerFault: draft.tardiesPerFault,
                    umbralPromedio: draft.umbralPromedio,
                    umbralAusencias: draft.umbralAusencias,
                    nivelConfigs: draft.nivelConfigs,
                    evalScales: draft.evalScales,
                });
                if (!id) return;

                await Promise.all([
                    svc.saveSetting(id, "duracion_leccion", draft.duracionLeccion),
                    svc.saveSetting(id, "default_lecciones", draft.defaultLecciones),
                    svc.saveSetting(id, "unjustified_absences_per_fault", draft.unjustifiedAbsencesPerFault),
                    svc.saveSetting(id, "tardies_per_fault", draft.tardiesPerFault),
                    svc.saveSetting(id, "umbral_promedio", draft.umbralPromedio),
                    svc.saveSetting(id, "umbral_ausencias", draft.umbralAusencias),
                    svc.saveSetting(id, "nivel_configs", draft.nivelConfigs),
                    svc.saveSetting(id, "eval_scales", draft.evalScales),
                ]);
            },

            loadFromDb: async (institutionId) => {
                const raw = await svc.loadAllSettings(institutionId);
                const patch: Record<string, unknown> = {};
                const tryParse = (k: string) => {
                    try {
                        return JSON.parse(raw[k]);
                    } catch {
                        return undefined;
                    }
                };

                if (raw.umbral_promedio) patch.umbralPromedio = tryParse("umbral_promedio");
                if (raw.umbral_ausencias) patch.umbralAusencias = tryParse("umbral_ausencias");
                if (raw.duracion_leccion) patch.duracionLeccion = tryParse("duracion_leccion");
                if (raw.default_lecciones) patch.defaultLecciones = tryParse("default_lecciones");
                if (raw.unjustified_absences_per_fault) patch.unjustifiedAbsencesPerFault = tryParse("unjustified_absences_per_fault");
                if (raw.tardies_per_fault) patch.tardiesPerFault = tryParse("tardies_per_fault");
                if (raw.rango_numerica) patch.rangoNumerica = tryParse("rango_numerica");
                if (raw.rango_analitica) patch.rangoAnalitica = tryParse("rango_analitica");
                if (raw.eval_scales) patch.evalScales = tryParse("eval_scales");
                if (raw.nivel_configs) patch.nivelConfigs = tryParse("nivel_configs");

                if (!raw.eval_scales) {
                    const numericRange = (patch.rangoNumerica as RangoEval | undefined) ?? DEFAULT_RANGO_NUMERICA;
                    const analyticRange = (patch.rangoAnalitica as RangoEval | undefined) ?? DEFAULT_RANGO_ANALITICA;
                    patch.evalScales = [
                        { id: "numerica", label: "Numerica", min: numericRange.min, max: numericRange.max },
                        { id: "analitica", label: "Analitica", min: analyticRange.min, max: analyticRange.max },
                    ];
                }

                if (Object.keys(patch).length) set(patch as never);
            },
        }),
        { name: "grading-config" }
    )
);
