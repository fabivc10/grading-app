import { create } from "zustand";
import type { StudentEval, StudentCotidiano, EvalWeights, EvalCategory, EvalEntry } from "./types";
import * as svc from "./service";

const DEFAULT_WEIGHTS: EvalWeights = {
    conducta: 10, cotidiano: 20, tareas: 20, prueba: 30, proyecto: 10, asistencia: 10,
};

type EvaluacionesState = {
    institutionId: number | null;
    records:    StudentEval[];
    cotidianos: StudentCotidiano[];
    weights:    EvalWeights;
    load: (institutionId: number) => Promise<void>;
    updateRecord: (id: string, patch: Partial<StudentEval>) => Promise<void>;
    deleteRecord: (id: string) => Promise<void>;
    addEvalEntry: (recordIds: string[], category: EvalCategory, nombre: string, items: EvalEntry["items"]) => Promise<void>;
    updateConducta: (estudianteId: string, conductaPct: number) => Promise<void>;
    setWeights: (w: EvalWeights) => void;
};

export const useEvaluacionesStore = create<EvaluacionesState>()((set, get) => ({
    institutionId: null,
    records: [],
    cotidianos: [],
    weights: DEFAULT_WEIGHTS,

    load: async (institutionId) => {
        try {
            const [records, cotidianos] = await Promise.all([
                svc.fetchEvaluaciones(institutionId),
                svc.fetchStudentCotidianos(institutionId),
            ]);
            set({ institutionId, records, cotidianos });
        } catch (err) {
            console.error("[evaluaciones] load failed:", err);
        }
    },

    updateRecord: async (id, patch) => {
        await svc.updateEvaluacion(id, patch);
        set((s) => ({
            records: s.records.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
    },

    deleteRecord: async (id) => {
        await svc.deleteEvaluacion(id);
        set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
    },

    addEvalEntry: async (recordIds, category, nombre, items) => {
        const created = await svc.addEvalEntryBatch(recordIds, category, nombre, items);
        const pct = items.reduce((s, i) => s + i.valor, 0);
        set((s) => ({
            records: s.records.map((r) => {
                const match = created.find((c) => c.recordId === r.id);
                if (!match) return r;
                const newEntry: EvalEntry = { id: match.entryId, nombre, pct, items: match.items };
                return { ...r, [category]: [...(r[category as EvalCategory] as EvalEntry[]), newEntry] };
            }),
        }));
    },

    updateConducta: async (estudianteId, conductaPct) => {
        await svc.updateStudentCotidiano(estudianteId, { conductaPct });
        set((s) => ({
            cotidianos: s.cotidianos.map((c) =>
                c.estudianteId === estudianteId ? { ...c, conductaPct } : c
            ),
        }));
    },

    setWeights: (w) => set({ weights: w }),
}));
