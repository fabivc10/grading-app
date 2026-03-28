import { create } from "zustand";
import type { AsistenciaSemana, AsistenciaDia, AsistStudent, DayKey, EstadoAsist, GlobalSemConfig } from "../types";
import * as svc from "../services/attendance.service";
import { useEvaluacionesStore } from "../../evaluations/store";

const EMPTY_CONFIG: GlobalSemConfig = { s1Start: '', s1End: '', s2Start: '', s2End: '' };

/** Determine which semester a week belongs to based on overlap with global config */
function semOfDate(weekDate: string, cfg: GlobalSemConfig): 's1' | 's2' | null {
    const weekStart = new Date(weekDate + 'T12:00:00');
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);

    if (cfg.s1Start && cfg.s1End) {
        const start = new Date(cfg.s1Start + 'T12:00:00');
        const end = new Date(cfg.s1End + 'T12:00:00');
        if (weekStart <= end && weekEnd >= start) return 's1';
    }
    if (cfg.s2Start && cfg.s2End) {
        const start = new Date(cfg.s2Start + 'T12:00:00');
        const end = new Date(cfg.s2End + 'T12:00:00');
        if (weekStart <= end && weekEnd >= start) return 's2';
    }
    return null;
}

type AsistenciaState = {
    draftMode: boolean;
    asignaturaId:  string;
    institutionId: number;
    semConfig:  GlobalSemConfig;
    semanas:    AsistenciaSemana[];
    dias:       AsistenciaDia[];
    students:   AsistStudent[];
    setDraftMode: (enabled: boolean) => void;
    loadAll:           (asignaturaId: string, institutionId: number) => Promise<void>;
    saveGlobalConfig:  (cfg: GlobalSemConfig) => Promise<void>;
    commitSemConfig: () => Promise<void>;
    updateDia: (
        weekDate: string,
        estudianteId: string,
        day: DayKey,
        estado: EstadoAsist | null,
        semestre?: 's1' | 's2'
    ) => Promise<void>;
};

export const useAsistenciaStore = create<AsistenciaState>()((set, get) => ({
    draftMode: false,
    asignaturaId:  "",
    institutionId: 1,
    semConfig:  EMPTY_CONFIG,
    semanas:    [],
    dias:       [],
    students:   [],
    setDraftMode: (enabled) => set({ draftMode: enabled }),

    loadAll: async (asignaturaId, institutionId) => {
        try {
            const [data, semConfig] = await Promise.all([
                svc.fetchAsistenciaAll(asignaturaId),
                svc.fetchGlobalSemConfig(institutionId),
            ]);
            set({ asignaturaId, institutionId, semConfig, ...data });
        } catch (err) {
            console.error("[asistencia] loadAll failed:", err);
        }
    },

    saveGlobalConfig: async (cfg) => {
        set({ semConfig: cfg });
        if (get().draftMode) return;
        const { institutionId } = get();
        await svc.saveGlobalSemConfig(institutionId, cfg);
    },

    commitSemConfig: async () => {
        const { institutionId, semConfig } = get();
        await svc.saveGlobalSemConfig(institutionId, semConfig);
    },

    updateDia: async (weekDate, estudianteId, day, estado, explicitSemestre) => {
        const { asignaturaId, students, semConfig } = get();

        const semestre = explicitSemestre ?? semOfDate(weekDate, semConfig);
        if (!semestre) return; // week outside both semesters â€” ignore

        const studentIds = students.map(s => s.id);
        const { semana, dias: ensuredDias } = await svc.ensureSemanaForWeek(
            asignaturaId, semestre, weekDate, studentIds
        );

        // Some existing weeks were created without their student day rows.
        // Re-ensure the week on every edit so those missing rows are repaired.
        set(s => {
            const nextDias = new Map(s.dias.map(d => [d.id, d]));
            ensuredDias.forEach(d => {
                if (!nextDias.has(d.id)) nextDias.set(d.id, d);
            });

            const targetDia = ensuredDias.find(d => d.estudianteId === estudianteId);
            if (targetDia) {
                const currentDia = nextDias.get(targetDia.id) ?? targetDia;
                nextDias.set(targetDia.id, { ...currentDia, [day]: estado });
            }

            return {
                semanas: s.semanas.some(item => item.id === semana.id) ? s.semanas : [...s.semanas, semana],
                dias: Array.from(nextDias.values()),
            };
        });

        await svc.updateDiaField(semana.id, estudianteId, day, estado);

        const { institutionId } = get();
        if (institutionId) {
            await useEvaluacionesStore.getState().load(institutionId);
        }
    },
}));
