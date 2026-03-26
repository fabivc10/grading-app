import { create } from "zustand";
import type { Institution } from "./types";
import * as svc from "./service";

type InstitutionState = {
    institutions: Institution[];
    currentId: number;
    load: () => Promise<void>;
    switchTo: (id: number) => void;
    addInstitution: (data: Omit<Institution, "id">) => Promise<void>;
    updateInstitution: (id: number, data: Omit<Institution, "id">) => Promise<void>;
    deleteInstitution: (id: number) => Promise<void>;
};

export const useInstitutionStore = create<InstitutionState>()((set) => ({
    institutions: [],
    currentId: 1,

    load: async () => {
        const institutions = await svc.fetchInstitutions();
        set({ institutions, currentId: institutions[0]?.id ?? 1 });
    },

    switchTo: (id) => set({ currentId: id }),

    addInstitution: async (data) => {
        const inst = await svc.insertInstitution(data);
        set((s) => ({ institutions: [...s.institutions, inst], currentId: inst.id }));
    },

    updateInstitution: async (id, data) => {
        await svc.updateInstitution(id, data);
        set((s) => ({
            institutions: s.institutions.map((i) => i.id === id ? { id, ...data } : i),
        }));
    },

    deleteInstitution: async (id) => {
        await svc.deleteInstitution(id);
        set((s) => {
            const institutions = s.institutions.filter((i) => i.id !== id);
            const currentId = s.currentId === id ? (institutions[0]?.id ?? 0) : s.currentId;
            return { institutions, currentId };
        });
    },
}));

// Stable fallback — must be a module-level constant so Object.is returns true
// across renders when institutions haven't loaded yet.
const FALLBACK_INSTITUTION: Institution = { id: 1, name: "", code: "" };

export const selectCurrentInstitution = (s: InstitutionState): Institution =>
    s.institutions.find((i) => i.id === s.currentId) ?? s.institutions[0] ?? FALLBACK_INSTITUTION;
