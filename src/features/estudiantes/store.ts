import { create } from "zustand";
import type { Estudiante, EstudianteFormData } from "./types";
import * as svc from "./service";

type EstudiantesState = {
    estudiantes: Estudiante[];
    load: (institutionId: number) => Promise<void>;
    addEstudiante: (institutionId: number, data: EstudianteFormData) => Promise<void>;
    updateEstudiante: (id: string, data: EstudianteFormData) => Promise<void>;
    deleteEstudiante: (id: string) => Promise<void>;
};

export const useEstudiantesStore = create<EstudiantesState>()((set) => ({
    estudiantes: [],

    load: async (institutionId) => {
        const estudiantes = await svc.fetchEstudiantes(institutionId);
        set({ estudiantes });
    },

    addEstudiante: async (institutionId, data) => {
        await svc.insertEstudiante(institutionId, data);
        const estudiantes = await svc.fetchEstudiantes(institutionId);
        set({ estudiantes });
    },

    updateEstudiante: async (id, data) => {
        await svc.updateEstudiante(id, data);
        set((s) => ({
            estudiantes: s.estudiantes.map((e) => (e.id === id ? { ...e, ...data } : e)),
        }));
    },

    deleteEstudiante: async (id) => {
        await svc.deleteEstudiante(id);
        set((s) => ({ estudiantes: s.estudiantes.filter((e) => e.id !== id) }));
    },
}));
