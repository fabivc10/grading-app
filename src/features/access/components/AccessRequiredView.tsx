import { FormEvent, useState } from "react";
import { ShieldKeyIcon } from "../../../shared/ui/icons";
import type { User } from "../../auth/types";
import styles from "./AccessRequiredView.module.css";

type Props = {
    user: User;
    publicAccountId?: string;
    status: "checking" | "payment_required" | "blocked" | "granted" | "degraded";
    error?: string;
    mode?: "page" | "overlay";
    onLogout: () => void;
    onSubmitAccessCode?: (code: string) => Promise<void>;
    accessCodeError?: string;
    accessCodeBusy?: boolean;
};

export function AccessRequiredView({
    user,
    publicAccountId,
    status,
    error,
    mode = "page",
    onLogout,
    onSubmitAccessCode,
    accessCodeError,
    accessCodeBusy,
}: Props) {
    const [enteredCode, setEnteredCode] = useState("");
    const isChecking = status === "checking";
    const whatsappLink = "https://wa.me/50685859875";
    const gmailLink = "https://mail.google.com/mail/?view=cm&fs=1&to=favargasc10@gmail.com";
    const showCodeInput = Boolean(onSubmitAccessCode && !isChecking && status !== "granted");
    const accentLabel = isChecking
        ? "Verificando"
        : status === "blocked"
          ? "App bloqueada"
          : status === "granted"
            ? "Cuenta activa"
            : status === "degraded"
              ? "Revision pendiente"
              : "Pago pendiente";

    const handleSubmitCode = async (event: FormEvent) => {
        event.preventDefault();
        if (!onSubmitAccessCode) return;
        await onSubmitAccessCode(enteredCode);
    };

    return (
        <div
            className={`${styles.shell} ${mode === "overlay" ? styles.shellOverlay : ""}`}
            data-status={status}
        >
            <div className={`${styles.backdrop} ${mode === "overlay" ? styles.backdropOverlay : ""}`} />
            <section className={`${styles.card} ${mode === "overlay" ? styles.cardOverlay : ""}`}>
                <header className={styles.hero}>
                    <div className={styles.badge}>{accentLabel}</div>
                    <div className={styles.iconWrap}>
                        <ShieldKeyIcon className={styles.icon} />
                    </div>
                    <div className={styles.heroCopy}>
                        <h1 className={styles.title}>Activacion de cuenta</h1>
                        <p className={styles.subtitle}>
                            {status === "granted"
                                ? "Tu cuenta ya tiene un codigo de acceso activo."
                                : status === "degraded"
                                  ? "No pudimos validar el estado remoto. Ingresa tu codigo de acceso o cierra sesion."
                                  : "Tu cuenta necesita un pago activo para entrar al sistema."}
                        </p>
                    </div>
                </header>

                <div className={styles.content}>
                    {isChecking ? (
                        <section className={styles.loadingState} aria-live="polite" aria-busy="true">
                            <div className={styles.loadingSpinner} />
                            <p className={styles.loadingTitle}>Cargando informacion de pagos</p>
                            <p className={styles.loadingText}>Espera un momento mientras preparamos los datos del modal.</p>
                        </section>
                    ) : (
                        <>
                            <section className={styles.panel}>
                                <p className={styles.panelTitle}>Codigo de cuenta</p>
                                <div className={styles.accountMeta}>
                                    <strong className={styles.accountName}>{user.name}</strong>
                                    <span className={styles.accountDetails}>ID: {publicAccountId || "No disponible"} · {user.email}</span>
                                </div>
                                {status === "blocked" && error ? <p className={styles.error}>{error}</p> : null}
                            </section>

                            <section className={styles.panel}>
                                <p className={styles.panelTitle}>Como activar tu cuenta</p>
                                <div className={styles.contactGrid}>
                                    <a className={styles.contactCard} href={gmailLink} target="_blank" rel="noreferrer">
                                        <span className={styles.contactLabel}>Gmail</span>
                                        <strong className={styles.contactValue}>favargasc10@gmail.com</strong>
                                        <span className={styles.contactHint}>Abrir Gmail y redactar a esta direccion</span>
                                    </a>
                                    <a className={styles.contactCard} href={whatsappLink} target="_blank" rel="noreferrer">
                                        <span className={styles.contactLabel}>WhatsApp</span>
                                        <strong className={styles.contactValue}>+506 85859875</strong>
                                        <span className={styles.contactHint}>Abrir chat directo por WhatsApp</span>
                                    </a>
                                </div>
                                <div className={styles.steps}>
                                    <ul className={styles.stepsList}>
                                        <li>Favor indicar en el detalle el codigo de cuenta, numero de cedula o nombre completo.</li>
                                        <li>
                                            Enviar el comprobante de pago a{" "}
                                            <a className={styles.inlineLink} href={gmailLink} target="_blank" rel="noreferrer">
                                                favargasc10@gmail.com
                                            </a>{" "}
                                            o confirmarlo al telefono o WhatsApp{" "}
                                            <a className={styles.inlineLink} href={whatsappLink} target="_blank" rel="noreferrer">
                                                +506 85859875
                                            </a>
                                            .
                                        </li>
                                        <li>Despues de confirmar el pago se generara un codigo de acceso y se activara tu cuenta en un maximo de 24 horas.</li>
                                    </ul>
                                </div>
                            </section>

                            {showCodeInput ? (
                                <section className={styles.codeSection}>
                                    <p className={styles.panelTitle}>Codigo de acceso</p>
                                    <form className={styles.codeForm} onSubmit={handleSubmitCode}>
                                        <input
                                            type="text"
                                            className={styles.codeInput}
                                            value={enteredCode}
                                            onChange={(event) => setEnteredCode(event.target.value)}
                                            placeholder="Ingresa el codigo que recibiste"
                                            autoComplete="one-time-code"
                                            disabled={accessCodeBusy}
                                        />
                                        <div className={styles.inlineActions}>
                                            <button type="submit" className={styles.primaryBtn} disabled={accessCodeBusy}>
                                                {accessCodeBusy ? "Verificando..." : "Verificar"}
                                            </button>
                                            <button type="button" className={styles.secondaryBtn} onClick={onLogout}>
                                                Cerrar sesion
                                            </button>
                                        </div>
                                    </form>
                                    {accessCodeError ? <p className={styles.error}>{accessCodeError}</p> : null}
                                </section>
                            ) : null}
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
