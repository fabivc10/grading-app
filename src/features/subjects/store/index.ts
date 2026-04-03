import { create } from "zustand";
import type { Asignatura, AsignaturaFormData, Semestre } from "../types";
import * as svc from "../services/subjects.service";
import { useInstitutionStore } from "../../institution/store";
import { useEstudiantesStore } from "../../students/store";
import { useEvaluacionesStore } from "../../evaluations/store";
import { useHorariosStore } from "../../schedules/store";

type AsignaturasState = {
    asignaturas: Asignatura[];
    load: (institutionId: number) => Promise<void>;
    addAsignatura: (institutionId: number, data: AsignaturaFormData) => Promise<Asignatura>;
    updateAsignatura: (id: string, data: AsignaturaFormData, semestres: [Semestre, Semestre]) => Promise<void>;
    deleteAsignatura: (id: string) => Promise<void>;
    decrementLeccion: (id: string) => Promise<void>;
};

export const useAsignaturasStore = create<AsignaturasState>()((set) => ({
    asignaturas: [],

    load: async (institutionId) => {
        const asignaturas = await svc.fetchAsignaturas(institutionId);
        set({ asignaturas });
    },

    addAsignatura: async (institutionId, data) => {
        const nueva = await svc.insertAsignatura(institutionId, data);
        set((s) => ({ asignaturas: [nueva, ...s.asignaturas] }));
        return nueva;
    },

    updateAsignatura: async (id, data, semestres) => {
        await svc.updateAsignatura(id, data, semestres);
        set((s) => ({
            asignaturas: s.asignaturas.map((a) => (a.id === id ? { ...a, ...data, semestres } : a)),
        }));
    },

    deleteAsignatura: async (id) => {
        await svc.deleteAsignatura(id);
        set((s) => ({ asignaturas: s.asignaturas.filter((a) => a.id !== id) }));
        const institutionId = useInstitutionStore.getState().currentId;
        if (!institutionId) return;
        await Promise.all([
            useEstudiantesStore.getState().load(institutionId),
            useEvaluacionesStore.getState().load(institutionId),
            useHorariosStore.getState().load(institutionId),
        ]);
    },

    decrementLeccion: async (id) => {
        await svc.decrementLeccion(id);
        set((s) => ({
            asignaturas: s.asignaturas.map((a) =>
                a.id === id ? { ...a, lecciones: Math.max(0, a.lecciones - 1) } : a
            ),
        }));
    },
}));
