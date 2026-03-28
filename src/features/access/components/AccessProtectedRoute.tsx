import { Outlet } from "react-router-dom";
import { AccessGate } from "./AccessGate";

export function AccessProtectedRoute() {
    return (
        <AccessGate>
            <Outlet />
        </AccessGate>
    );
}
