import { create } from "zustand";
import type { AsigRef, Estudiante, EstudianteFormData, ImportedStudentRow } from "../types";
import * as svc from "../services/students.service";
import { useEvaluacionesStore } from "../../evaluations/store";

async function reloadEvaluacionesIfNeeded(institutionId: number) {
    const evaluacionesStore = useEvaluacionesStore.getState();
    if (evaluacionesStore.institutionId !== institutionId) return;
    await evaluacionesStore.load(institutionId);
}

type EstudiantesState = {
    estudiantes: Estudiante[];
    load: (institutionId: number) => Promise<void>;
    addEstudiante: (institutionId: number, data: EstudianteFormData) => Promise<void>;
    updateEstudiante: (id: string, data: EstudianteFormData) => Promise<void>;
    deleteEstudiante: (id: string) => Promise<void>;
    deleteEstudiantes: (ids: string[]) => Promise<void>;
    assignAsignaturaToEstudiantes: (institutionId: number, ids: string[], asignaturaId: string) => Promise<void>;
    importEstudiantes: (
        institutionId: number,
        rows: ImportedStudentRow[],
        asignaturas: AsigRef[],
        defaultLecciones: number
    ) => Promise<void>;
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
        await reloadEvaluacionesIfNeeded(institutionId);
        set({ estudiantes });
    },

    updateEstudiante: async (id, data) => {
        await svc.updateEstudiante(id, data);
        const institutionId = useEvaluacionesStore.getState().institutionId;
        if (institutionId) {
            const estudiantes = await svc.fetchEstudiantes(institutionId);
            await reloadEvaluacionesIfNeeded(institutionId);
            set({ estudiantes });
            return;
        }

        set((s) => ({
            estudiantes: s.estudiantes.map((e) => (e.id === id ? { ...e, ...data } : e)),
        }));
    },

    deleteEstudiante: async (id) => {
        await svc.deleteEstudiante(id);
        const institutionId = useEvaluacionesStore.getState().institutionId;
        if (institutionId) {
            const estudiantes = await svc.fetchEstudiantes(institutionId);
            await reloadEvaluacionesIfNeeded(institutionId);
            set({ estudiantes });
            return;
        }

        set((s) => ({ estudiantes: s.estudiantes.filter((e) => e.id !== id) }));
    },

    deleteEstudiantes: async (ids) => {
        if (!ids.length) return;
        await svc.deleteEstudiantes(ids);
        const institutionId = useEvaluacionesStore.getState().institutionId;
        if (institutionId) {
            const estudiantes = await svc.fetchEstudiantes(institutionId);
            await reloadEvaluacionesIfNeeded(institutionId);
            set({ estudiantes });
            return;
        }

        const selected = new Set(ids);
        set((s) => ({ estudiantes: s.estudiantes.filter((e) => !selected.has(e.id)) }));
    },

    assignAsignaturaToEstudiantes: async (institutionId, ids, asignaturaId) => {
        if (!ids.length || !asignaturaId) return;
        await svc.assignAsignaturaToEstudiantes(ids, asignaturaId);
        const estudiantes = await svc.fetchEstudiantes(institutionId);
        await reloadEvaluacionesIfNeeded(institutionId);
        set({ estudiantes });
    },

    importEstudiantes: async (institutionId, rows, asignaturas, defaultLecciones) => {
        await svc.importEstudiantesFromRows(institutionId, rows, asignaturas, defaultLecciones);
        const estudiantes = await svc.fetchEstudiantes(institutionId);
        await reloadEvaluacionesIfNeeded(institutionId);
        set({ estudiantes });
    },
}));
