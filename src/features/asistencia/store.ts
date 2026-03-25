import { create } from "zustand";
import type { AsistenciaSemana, AsistenciaDia, AsistStudent, DayKey, EstadoAsist, GlobalSemConfig } from "./types";
import * as svc from "./service";

const EMPTY_CONFIG: GlobalSemConfig = { s1Start: '', s1End: '', s2Start: '', s2End: '' };

/** Determine which semester a weekDate belongs to based on global config */
function semOfDate(weekDate: string, cfg: GlobalSemConfig): 's1' | 's2' | null {
    const d = new Date(weekDate + 'T12:00:00');
    if (cfg.s1Start && cfg.s1End) {
        if (d >= new Date(cfg.s1Start + 'T12:00:00') && d <= new Date(cfg.s1End + 'T12:00:00')) return 's1';
    }
    if (cfg.s2Start && cfg.s2End) {
        if (d >= new Date(cfg.s2Start + 'T12:00:00') && d <= new Date(cfg.s2End + 'T12:00:00')) return 's2';
    }
    return null;
}

type AsistenciaState = {
    asignaturaId:  string;
    institutionId: number;
    semConfig:  GlobalSemConfig;
    semanas:    AsistenciaSemana[];
    dias:       AsistenciaDia[];
    students:   AsistStudent[];
    loadAll:           (asignaturaId: string, institutionId: number) => Promise<void>;
    saveGlobalConfig:  (cfg: GlobalSemConfig) => Promise<void>;
    updateDia: (weekDate: string, estudianteId: string, day: DayKey, estado: EstadoAsist | null) => Promise<void>;
};

export const useAsistenciaStore = create<AsistenciaState>()((set, get) => ({
    asignaturaId:  "",
    institutionId: 1,
    semConfig:  EMPTY_CONFIG,
    semanas:    [],
    dias:       [],
    students:   [],

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
        const { institutionId } = get();
        await svc.saveGlobalSemConfig(institutionId, cfg);
        set({ semConfig: cfg });
    },

    updateDia: async (weekDate, estudianteId, day, estado) => {
        const { asignaturaId, students, semanas, semConfig } = get();

        const semestre = semOfDate(weekDate, semConfig);
        if (!semestre) return; // week outside both semesters — ignore

        const existing = semanas.find(s => s.inicioDate === weekDate && s.semestre === semestre);

        if (existing) {
            // Optimistic update
            set(s => ({
                dias: s.dias.map(d =>
                    d.semanaId === existing.id && d.estudianteId === estudianteId
                        ? { ...d, [day]: estado } : d
                ),
            }));
            await svc.updateDiaField(existing.id, estudianteId, day, estado);
        } else {
            const studentIds = students.map(s => s.id);
            const { semana, dias: newDias } = await svc.ensureSemanaForWeek(
                asignaturaId, semestre, weekDate, studentIds
            );
            set(s => ({
                semanas: [...s.semanas, semana],
                dias: [
                    ...s.dias,
                    ...newDias.map(d =>
                        d.estudianteId === estudianteId ? { ...d, [day]: estado } : d
                    ),
                ],
            }));
            await svc.updateDiaField(semana.id, estudianteId, day, estado);
        }
    },
}));
