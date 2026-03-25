import { useEffect, type ReactNode } from "react";
import { useThemeStore } from "../features/theme/store";
import { useInstitutionStore } from "../features/institution/store";
import { useAsignaturasStore } from "../features/asignaturas/store";
import { useEstudiantesStore } from "../features/estudiantes/store";
import { useHorariosStore } from "../features/horarios/store";
import { useEvaluacionesStore } from "../features/evaluaciones/store";

// ─── ThemeSync ────────────────────────────────────────────────────────────────
// Applies the stored theme to <html data-theme="..."> on first render and changes.
function ThemeSync() {
    const theme = useThemeStore((s) => s.theme);
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);
    return null;
}

// ─── DbInit ───────────────────────────────────────────────────────────────────
// On mount: initialises the DB connection and loads institutions.
// Whenever currentId changes: reloads all domain stores for that institution.
function DbInit() {
    const { load: loadInst, currentId } = useInstitutionStore();
    const loadAsignaturas  = useAsignaturasStore((s) => s.load);
    const loadEstudiantes  = useEstudiantesStore((s) => s.load);
    const loadHorarios     = useHorariosStore((s) => s.load);
    const loadEvaluaciones = useEvaluacionesStore((s) => s.load);

    // Load institutions once on mount
    useEffect(() => {
        loadInst();
    }, [loadInst]);

    // Reload all domain data whenever the active institution changes
    useEffect(() => {
        if (!currentId) return;
        loadAsignaturas(currentId);
        loadEstudiantes(currentId);
        loadHorarios(currentId);
        loadEvaluaciones(currentId);
    }, [currentId, loadAsignaturas, loadEstudiantes, loadHorarios, loadEvaluaciones]);

    return null;
}

// ─── Providers ────────────────────────────────────────────────────────────────
export function Providers({ children }: { children: ReactNode }) {
    return (
        <>
            <ThemeSync />
            <DbInit />
            {children}
        </>
    );
}
