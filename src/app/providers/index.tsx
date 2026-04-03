import { useEffect, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAuthStore } from "../../features/auth/store";
import { useThemeStore } from "../../features/theme/store";
import { useInstitutionStore } from "../../features/institution/store";
import { useAsignaturasStore } from "../../features/subjects/store";
import { useEstudiantesStore } from "../../features/students/store";
import { useHorariosStore } from "../../features/schedules/store";
import { useEvaluacionesStore } from "../../features/evaluations/store";
import { DEFAULT_INJUSTIFIED_EQUIVALENCE, DEFAULT_TARDIES_PER_FAULT } from "../../features/attendance/utils/attendance.utils";
import {
    DEFAULT_EVAL_SCALES,
    DEFAULT_RANGO_ANALITICA,
    DEFAULT_RANGO_NUMERICA,
    DEFAULT_UMBRAL_AUSENCIAS,
    DEFAULT_UMBRAL_PROMEDIO,
} from "../../features/settings/constants";
import { useConfiguracionStore } from "../../features/settings/store";
import { AlertChecker } from "../bootstrap/AlertChecker";
import { getDb } from "../../shared/lib/db";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ ThemeSync Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Applies the stored theme to <html data-theme="..."> on first render and changes.
function ThemeSync() {
    const theme = useThemeStore((s) => s.theme);
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);
    return null;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DbInit Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// On mount: initialises the DB connection and loads institutions.
// Whenever currentId changes: reloads all domain stores for that institution.
function DbInit() {
    const user = useAuthStore((s) => s.user);
    const { load: loadInst, reset: resetInst, currentId } = useInstitutionStore();
    const loadAsignaturas  = useAsignaturasStore((s) => s.load);
    const loadEstudiantes  = useEstudiantesStore((s) => s.load);
    const loadHorarios     = useHorariosStore((s) => s.load);
    const loadEvaluaciones   = useEvaluacionesStore((s) => s.load);
    const loadConfiguracion  = useConfiguracionStore((s) => s.loadFromDb);

    useEffect(() => {
        if (!isTauri()) return;

        void getDb().catch(() => {});
    }, []);

    useEffect(() => {
        if (!user) {
            resetInst();
            useAsignaturasStore.setState({ asignaturas: [] });
            useEstudiantesStore.setState({ estudiantes: [] });
            useHorariosStore.setState({ entries: [], breaks: [] });
            useEvaluacionesStore.setState({ institutionId: null, records: [], cotidianos: [] });
            useConfiguracionStore.setState({
                duracionLeccion: 45,
                defaultLecciones: 30,
                unjustifiedAbsencesPerFault: DEFAULT_INJUSTIFIED_EQUIVALENCE,
                tardiesPerFault: DEFAULT_TARDIES_PER_FAULT,
                umbralPromedio: DEFAULT_UMBRAL_PROMEDIO,
                umbralAusencias: DEFAULT_UMBRAL_AUSENCIAS,
                nivelConfigs: {},
                rangoNumerica: DEFAULT_RANGO_NUMERICA,
                rangoAnalitica: DEFAULT_RANGO_ANALITICA,
                evalScales: DEFAULT_EVAL_SCALES,
            });
            return;
        }

        void loadInst();
    }, [user, loadInst, resetInst]);

    useEffect(() => {
        if (!user || !currentId) return;
        loadAsignaturas(currentId);
        loadEstudiantes(currentId);
        loadHorarios(currentId);
        loadEvaluaciones(currentId);
        loadConfiguracion(currentId);
    }, [user, currentId, loadAsignaturas, loadEstudiantes, loadHorarios, loadEvaluaciones, loadConfiguracion]);

    return null;
}

function AuthBootstrap() {
    const hydrated = useAuthStore((s) => s.hydrated);
    const hydrateFromLocalSession = useAuthStore((s) => s.hydrateFromLocalSession);

    useEffect(() => {
        if (hydrated) return;
        void hydrateFromLocalSession();
    }, [hydrated, hydrateFromLocalSession]);

    return null;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Providers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export function Providers({ children }: { children: ReactNode }) {
    return (
        <>
            <ThemeSync />
            <AuthBootstrap />
            <DbInit />
            <AlertChecker />
            {children}
        </>
    );
}
