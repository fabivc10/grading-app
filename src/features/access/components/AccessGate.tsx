import { useEffect } from "react";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../auth/services/auth.service";
import { useAuthStore } from "../../auth/store";
import { AccessRequiredView } from "./AccessRequiredView";
import { useAccessStore } from "../store";
import styles from "./AccessGate.module.css";

export function AccessGate({ children }: PropsWithChildren) {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const status = useAccessStore((s) => s.status);
    const publicAccountId = useAccessStore((s) => s.publicAccountId);
    const error = useAccessStore((s) => s.error);
    const checkAccess = useAccessStore((s) => s.checkAccess);
    const reset = useAccessStore((s) => s.reset);
    const submitAccessCode = useAccessStore((s) => s.submitAccessCode);
    const accessCodeError = useAccessStore((s) => s.accessCodeError);
    const accessCodeBusy = useAccessStore((s) => s.accessCodeBusy);

    useEffect(() => {
        if (!user) {
            reset();
            return;
        }
        void checkAccess(user);
    }, [user, checkAccess, reset]);

    if (!user) return null;

    if (status === "granted") {
        return <div className={styles.root}>{children}</div>;
    }

    return (
        <div className={styles.root}>
            {children}
            <AccessRequiredView
                user={user}
                publicAccountId={publicAccountId}
                status={status === "idle" ? "checking" : status}
                error={error}
                mode="overlay"
                onLogout={() => {
                    void logout().finally(() => navigate("/login", { replace: true }));
                }}
                onSubmitAccessCode={(code) => submitAccessCode(user, code)}
                accessCodeError={accessCodeError}
                accessCodeBusy={accessCodeBusy}
            />
        </div>
    );
}
