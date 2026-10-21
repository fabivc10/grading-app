import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { MainLayout } from "../layouts/MainLayout";
import { ProtectedRoute } from "../../features/auth/components/ProtectedRoute";
import { LandingPage } from "../../features/auth/pages/LandingPage";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { RegisterPage } from "../../features/auth/pages/RegisterPage";
import { AuthConfirmPage } from "../../features/auth/pages/AuthConfirmPage";
import { OAuthBridgePage } from "../../features/auth/pages/OAuthBridgePage";
import { SubjectsPage } from "../../features/subjects/pages/SubjectsPage";
import { StudentsPage } from "../../features/students/pages/StudentsPage";
import { EvaluationsPage } from "../../features/evaluations/pages/EvaluationsPage";
import { SchedulesPage } from "../../features/schedules/pages/SchedulesPage";
import { AttendancePage } from "../../features/attendance/pages/AttendancePage";
import { ReportsPage } from "../../features/reports/pages/ReportsPage";
import { SettingsPage } from "../../features/settings/pages/SettingsPage";
import { ProfilePage } from "../../features/profile/pages/ProfilePage";
import { PaymentsPage } from "../../features/payments/pages/PaymentsPage";
import { AccessProtectedRoute } from "../../features/access/components/AccessProtectedRoute";

// Auth pages exist only in the desktop app; the web build goes straight into the app.
function desktopOnly(element: ReactNode) {
    return isTauri() ? element : <Navigate to="/app" replace />;
}

export const router = createBrowserRouter([
    { path: "/",      element: desktopOnly(<LandingPage />) },
    { path: "/login", element: desktopOnly(<LoginPage />) },
    { path: "/register", element: desktopOnly(<RegisterPage />) },
    { path: "/auth/confirm", element: <AuthConfirmPage /> },
    { path: "/oauth/callback", element: <OAuthBridgePage /> },
    {
        path: "/app",
        element: <ProtectedRoute />,
        children: [
            {
                element: <AccessProtectedRoute />,
                children: [
                    {
                        path: "pagos",
                        element: <PaymentsPage />,
                    },
                    {
                        element: <MainLayout />,
                        children: [
                            { index: true,              element: <SubjectsPage /> },
                            { path: "estudiantes",      element: <StudentsPage /> },
                            { path: "reportes",         element: <ReportsPage /> },
                            { path: "horarios",         element: <SchedulesPage /> },
                            { path: "evaluaciones",     element: <EvaluationsPage /> },
                            { path: "asistencia",       element: <AttendancePage /> },
                            { path: "perfil",           element: <ProfilePage /> },
                            { path: "configuracion",    element: <SettingsPage /> },
                        ],
                    },
                ],
            },
        ],
    },
]);
