import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store";

export function ProtectedRoute() {
    const user = useAuthStore((s) => s.user);
    const hydrated = useAuthStore((s) => s.hydrated);

    if (!hydrated) return null;

    return user ? <Outlet /> : <Navigate to="/login" state={{ from: "/app" }} replace />;
}
