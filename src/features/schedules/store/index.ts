import { create } from "zustand";
import type { ScheduleEntry, Break } from "../types";
import * as svc from "../services/schedules.service";

type HorariosState = {
    entries: ScheduleEntry[];
    breaks: Break[];
    load: (institutionId: number) => Promise<void>;
    addEntry: (institutionId: number, e: Omit<ScheduleEntry, "id">) => Promise<void>;
    moveEntry: (id: string, day: number, slot: number) => Promise<void>;
    removeEntry: (id: string) => Promise<void>;
    addBreak: (institutionId: number, b: Omit<Break, "id">) => Promise<void>;
    removeBreak: (id: string) => Promise<void>;
};

export const useHorariosStore = create<HorariosState>()((set) => ({
    entries: [],
    breaks: [],

    load: async (institutionId) => {
        const [entries, breaks] = await Promise.all([
            svc.fetchEntries(institutionId),
            svc.fetchBreaks(institutionId),
        ]);
        set({ entries, breaks });
    },

    addEntry: async (institutionId, e) => {
        const entry = await svc.insertEntry(institutionId, e);
        set((s) => ({ entries: [...s.entries, entry] }));
    },

    moveEntry: async (id, day, slot) => {
        await svc.moveEntry(id, day, slot);
        set((s) => ({
            entries: s.entries.map((e) => (e.id === id ? { ...e, day, slot } : e)),
        }));
    },

    removeEntry: async (id) => {
        await svc.deleteEntry(id);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    },

    addBreak: async (institutionId, b) => {
        await svc.deleteEntriesInBreak(institutionId, b.startSlot, b.durationSlots, b.days);
        const brk = await svc.insertBreak(institutionId, b);
        set((s) => ({
            breaks: [...s.breaks, brk],
            entries: s.entries.filter(
                (e) =>
                    !b.days.includes(e.day) ||
                    e.slot < b.startSlot ||
                    e.slot >= b.startSlot + b.durationSlots
            ),
        }));
    },

    removeBreak: async (id) => {
        await svc.deleteBreak(id);
        set((s) => ({ breaks: s.breaks.filter((b) => b.id !== id) }));
    },
}));
