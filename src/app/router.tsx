import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { LandingPage } from "../features/auth/pages/LandingPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { AsignaturasPage } from "../features/asignaturas/pages/AsignaturasPage";
import { EstudiantesPage } from "../features/estudiantes/pages/EstudiantesPage";
import { EvaluacionesPage } from "../features/evaluaciones/pages/EvaluacionesPage";
import { HorariosPage } from "../features/horarios/pages/HorariosPage";
import { AsistenciaPage } from "../features/asistencia/pages/AsistenciaPage";
import { ReportesPage } from "../features/reportes/pages/ReportesPage";
import { ConfiguracionPage } from "../features/configuracion/pages/ConfiguracionPage";

export const router = createBrowserRouter([
    { path: "/",      element: <LandingPage /> },
    { path: "/login", element: <LoginPage /> },
    {
        path: "/app",
        element: <ProtectedRoute />,
        children: [
            {
                element: <MainLayout />,
                children: [
                    { index: true,              element: <AsignaturasPage /> },
                    { path: "estudiantes",      element: <EstudiantesPage /> },
                    { path: "reportes",         element: <ReportesPage /> },
                    { path: "horarios",         element: <HorariosPage /> },
                    { path: "evaluaciones",     element: <EvaluacionesPage /> },
                    { path: "asistencia",       element: <AsistenciaPage /> },
                    { path: "configuracion",    element: <ConfiguracionPage /> },
                ],
            },
        ],
    },
]);
