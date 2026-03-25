import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NotifPriority } from "../notifications/store";

export type ConfiguracionState = {
    duracionLeccion: number;
    alertasEnabled: boolean;
    alertaNotaEnabled: boolean;
    alertaNotaMinima: number;
    alertaNotaPrioridad: NotifPriority;
    alertaConductaEnabled: boolean;
    alertaConductaMinima: number;
    alertaConductaPrioridad: NotifPriority;
    setDuracionLeccion: (v: number) => void;
    setAlertas: (patch: Partial<Omit<ConfiguracionState, "setDuracionLeccion" | "setAlertas">>) => void;
};

export const useConfiguracionStore = create<ConfiguracionState>()(
    persist(
        (set) => ({
            duracionLeccion: 45,
            alertasEnabled: false,
            alertaNotaEnabled: true,
            alertaNotaMinima: 65,
            alertaNotaPrioridad: "alta",
            alertaConductaEnabled: false,
            alertaConductaMinima: 70,
            alertaConductaPrioridad: "media",
            setDuracionLeccion: (v) => set({ duracionLeccion: v }),
            setAlertas: (patch) => set(patch as Partial<ConfiguracionState>),
        }),
        { name: "grading-config" }
    )
);
