import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store";

export function ProtectedRoute() {
    const user = useAuthStore((s) => s.user);
    return user ? <Outlet /> : <Navigate to="/login" state={{ from: "/app" }} replace />;
}
