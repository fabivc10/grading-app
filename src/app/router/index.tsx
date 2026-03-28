import { createBrowserRouter } from "react-router-dom";
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

export const router = createBrowserRouter([
    { path: "/",      element: <LandingPage /> },
    { path: "/login", element: <LoginPage /> },
    { path: "/register", element: <RegisterPage /> },
    { path: "/auth/confirm", element: <AuthConfirmPage /> },
    { path: "/oauth/callback", element: <OAuthBridgePage /> },
    {
        path: "/app",
        element: <ProtectedRoute />,
        children: [
            {
                element: <MainLayout />,
                children: [
                    { path: "pagos",            element: <PaymentsPage /> },
                    {
                        element: <AccessProtectedRoute />,
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
