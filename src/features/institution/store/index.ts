import { create } from "zustand";
import type { Institution } from "../types";
import * as svc from "../services/institution.service";
import { useAuthStore } from "../../auth/store";

type InstitutionState = {
    institutions: Institution[];
    currentId: number;
    load: () => Promise<void>;
    reset: () => void;
    switchTo: (id: number) => void;
    addInstitution: (data: Omit<Institution, "id">) => Promise<void>;
    updateInstitution: (id: number, data: Omit<Institution, "id">, oldIconPath?: string) => Promise<void>;
    deleteInstitution: (id: number) => Promise<void>;
};

export const useInstitutionStore = create<InstitutionState>()((set) => ({
    institutions: [],
    currentId: 0,

    load: async () => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) {
            set({ institutions: [], currentId: 0 });
            return;
        }
        const institutions = await svc.fetchInstitutionsByOwner(currentUser.id);
        set((state) => ({
            institutions,
            currentId:
                institutions.find((item) => item.id === state.currentId)?.id ??
                institutions[0]?.id ??
                0,
        }));
    },

    reset: () => set({ institutions: [], currentId: 0 }),

    switchTo: (id) => set({ currentId: id }),

    addInstitution: async (data) => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) return;
        const inst = await svc.insertInstitution(currentUser.id, data);
        set((s) => ({ institutions: [...s.institutions, inst], currentId: inst.id }));
    },

    updateInstitution: async (id, data, oldIconPath) => {
        const updated = await svc.updateInstitution(id, data, oldIconPath);
        set((s) => ({
            institutions: s.institutions.map((i) => i.id === id ? updated : i),
        }));
    },

    deleteInstitution: async (id) => {
        const target = useInstitutionStore.getState().institutions.find((i) => i.id === id);
        await svc.deleteInstitution(id, target?.iconPath);
        set((s) => {
            const institutions = s.institutions.filter((i) => i.id !== id);
            const currentId = s.currentId === id ? (institutions[0]?.id ?? 0) : s.currentId;
            return { institutions, currentId };
        });
    },
}));

// Stable fallback — must be a module-level constant so Object.is returns true
// across renders when institutions haven't loaded yet.
const FALLBACK_INSTITUTION: Institution = { id: 0, name: "", code: "" };

export const selectCurrentInstitution = (s: InstitutionState): Institution =>
    s.institutions.find((i) => i.id === s.currentId) ?? s.institutions[0] ?? FALLBACK_INSTITUTION;
