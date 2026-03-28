import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { emailExists, registerWithCredentials } from "../services/auth.service";
import { useAuthStore } from "../store";
import styles from "./LoginPage.module.css";

export function RegisterPage() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            navigate("/app", { replace: true });
        }
    }, [user, navigate]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setInfo("");

        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
            setError("Completa todos los campos.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        setLoading(true);
        try {
            const registeredEmail = await emailExists(trimmedEmail);
            if (registeredEmail) {
                setError("Este correo ya esta registrado.");
                return;
            }

            const result = await registerWithCredentials(trimmedName, trimmedEmail, password);
            if (result) {
                if (result === "Este correo ya esta registrado.") {
                    setError("Este correo ya esta registrado.");
                    return;
                }
                setInfo(result);
                return;
            }
            navigate("/app", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "No fue posible completar el registro.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>G</div>
                    <h1>Crear cuenta</h1>
                    <p>Regístrate para empezar a usar Grading App</p>
                </div>

                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    <div className={styles.field}>
                        <label htmlFor="name">Nombre</label>
                        <input
                            id="name"
                            type="text"
                            placeholder="Tu nombre"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            disabled={loading}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="email">Correo electrónico</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="tu@correo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            disabled={loading}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            disabled={loading}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="confirmPassword">Confirmar contraseña</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            placeholder="********"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            disabled={loading}
                        />
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                    {info && <p className={styles.helper}>{info}</p>}
                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                        {loading ? "Creando cuenta..." : "Registrarse"}
                    </button>
                </form>

                <p className={styles.authSwitch}>
                    ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
                </p>
            </div>
        </div>
    );
}
