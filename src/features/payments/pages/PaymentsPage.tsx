import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AccessRequiredView } from "../../access/components/AccessRequiredView";
import { useAccessStore } from "../../access/store";
import { logout } from "../../auth/services/auth.service";
import { useAuthStore } from "../../auth/store";

const POST_LOGIN_REDIRECT_KEY = "grading.post_login_redirect";

export function PaymentsPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const status = useAccessStore((s) => s.status);
    const publicAccountId = useAccessStore((s) => s.publicAccountId);
    const error = useAccessStore((s) => s.error);
    const checkAccess = useAccessStore((s) => s.checkAccess);
    const submitAccessCode = useAccessStore((s) => s.submitAccessCode);
    const accessCodeError = useAccessStore((s) => s.accessCodeError);
    const accessCodeBusy = useAccessStore((s) => s.accessCodeBusy);

    useEffect(() => {
        if (!user) return;
        void checkAccess(user);
    }, [checkAccess, user]);

    if (!user) return null;

    return (
        <AccessRequiredView
            user={user}
            publicAccountId={publicAccountId}
            status={status === "idle" ? "checking" : status}
            error={error}
            onLogout={() => {
                window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "/app");
                void logout().finally(() => navigate("/login", { replace: true }));
            }}
            onSubmitAccessCode={(code) => submitAccessCode(user, code)}
            accessCodeError={accessCodeError}
            accessCodeBusy={accessCodeBusy}
        />
    );
}
