import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../auth/store";
import { changePassword, updateProfile } from "../../auth/services/auth.service";
import styles from "./ProfilePage.module.css";

function getInitials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
}

export function ProfilePage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);

    const [name, setName] = useState(user?.name ?? "");
    const [avatarData, setAvatarData] = useState<string | undefined>(user?.avatarData);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [profileMsg, setProfileMsg] = useState("");
    const [passwordMsg, setPasswordMsg] = useState("");

    useEffect(() => {
        setName(user?.name ?? "");
        setAvatarData(user?.avatarData);
    }, [user?.name, user?.avatarData]);

    const onAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") setAvatarData(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const saveProfile = async () => {
        if (!name.trim()) {
            setProfileMsg("El nombre es obligatorio.");
            return;
        }
        const err = await updateProfile(name.trim(), avatarData);
        setProfileMsg(err ?? "Perfil actualizado.");
    };

    const savePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordMsg("Completa todos los campos de contraseña.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMsg("La confirmación no coincide.");
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMsg("La nueva contraseña debe tener al menos 6 caracteres.");
            return;
        }
        const err = await changePassword(currentPassword, newPassword);
        if (err) {
            setPasswordMsg(err);
            return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordMsg("Contraseña actualizada.");
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Perfil</h2>
                    <p className={styles.subtitle}>
                        Administra tu información de cuenta y la seguridad de acceso.
                    </p>
                </div>
            </div>

            <div className={styles.grid}>
                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <p className={styles.eyebrow}>Cuenta</p>
                            <h3 className={styles.cardTitle}>Información del perfil</h3>
                        </div>
                    </div>

                    <div className={styles.profileTop}>
                        <div className={styles.avatarShell}>
                            <div className={styles.avatar}>
                                {avatarData ? (
                                    <img src={avatarData} alt={user?.name ?? "Usuario"} className={styles.avatarImg} />
                                ) : (
                                    <span>{getInitials(user?.name ?? "Usuario")}</span>
                                )}
                            </div>
                            <label className={styles.avatarUpload}>
                                <span>Cambiar foto</span>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={onAvatarChange}
                                />
                            </label>
                        </div>

                        <div className={styles.profileFields}>
                            <label className={styles.field}>
                                <span>Nombre</span>
                                <input value={name} onChange={(e) => setName(e.target.value)} />
                            </label>
                            <label className={styles.field}>
                                <span>Correo</span>
                                <input value={user?.email ?? ""} readOnly />
                            </label>
                            <label className={styles.field}>
                                <span>Identificador único de usuario</span>
                                <input value={String(user?.id ?? "")} readOnly />
                            </label>
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" className={styles.primaryBtn} onClick={saveProfile}>
                            Guardar perfil
                        </button>
                        {profileMsg && <span className={styles.message}>{profileMsg}</span>}
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <p className={styles.eyebrow}>Seguridad</p>
                            <h3 className={styles.cardTitle}>Cambiar contraseña</h3>
                        </div>
                    </div>

                    <div className={styles.passwordGrid}>
                        <label className={styles.field}>
                            <span>Contraseña actual</span>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                            />
                        </label>
                        <label className={styles.field}>
                            <span>Nueva contraseña</span>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </label>
                        <label className={styles.field}>
                            <span>Confirmar nueva contraseña</span>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </label>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" className={styles.primaryBtn} onClick={savePassword}>
                            Actualizar contraseña
                        </button>
                        {passwordMsg && <span className={styles.message}>{passwordMsg}</span>}
                    </div>
                </section>

                <section className={`${styles.card} ${styles.fullWidth}`}>
                    <div className={styles.cardHeader}>
                        <div>
                            <p className={styles.eyebrow}>Pagos</p>
                            <h3 className={styles.cardTitle}>Membresía, planes y facturación</h3>
                            <p className={styles.cardHint}>
                                Esta información ahora vive en una ventana aparte para que quede más clara.
                            </p>
                        </div>
                    </div>

                    <div className={styles.billingCta}>
                        <div>
                            <strong>Administra tu suscripción en una vista dedicada</strong>
                            <p>
                                Cambia de plan, revisa tu membresía y consulta el historial de pagos desde la sección de pagos.
                            </p>
                        </div>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() => navigate("/app/pagos")}
                        >
                            Ir a pagos
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
