import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AccessRequiredView } from "../../access/components/AccessRequiredView";
import { useAccessStore } from "../../access/store";
import { logout } from "../../auth/services/auth.service";
import { useAuthStore } from "../../auth/store";

const POST_LOGIN_REDIRECT_KEY = "grading.post_login_redirect";
const ACCESS_REDIRECT_KEY = "grading.access_redirect";

function consumeAccessRedirect() {
    const target = window.sessionStorage.getItem(ACCESS_REDIRECT_KEY) || "/app";
    window.sessionStorage.removeItem(ACCESS_REDIRECT_KEY);
    return target;
}

export function PaymentsPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const status = useAccessStore((s) => s.status);
    const publicAccountId = useAccessStore((s) => s.publicAccountId);
    const error = useAccessStore((s) => s.error);
    const submitAccessCode = useAccessStore((s) => s.submitAccessCode);
    const accessCodeError = useAccessStore((s) => s.accessCodeError);
    const accessCodeBusy = useAccessStore((s) => s.accessCodeBusy);

    useEffect(() => {
        if (status !== "granted") return;
        navigate(consumeAccessRedirect(), { replace: true });
    }, [status, navigate]);

    if (!user) return null;

    return (
        <AccessRequiredView
            user={user}
            publicAccountId={publicAccountId}
            status={status === "idle" ? "checking" : status}
            error={error}
            onLogout={() => {
                window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "/app");
                window.sessionStorage.removeItem(ACCESS_REDIRECT_KEY);
                void logout().finally(() => navigate("/login", { replace: true }));
            }}
            onSubmitAccessCode={(code) => submitAccessCode(user, code)}
            accessCodeError={accessCodeError}
            accessCodeBusy={accessCodeBusy}
        />
    );
}
