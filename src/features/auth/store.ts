import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, JWTPayload } from "./types";
import { TOKEN_KEY } from "../../shared/config/constants";
import * as authSvc from "./service";

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function createJWT(user: User): string {
    const header  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload: JWTPayload = { ...user, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 };
    return `${header}.${btoa(JSON.stringify(payload))}.${btoa("mock-signature")}`;
}

function decodeJWT(token: string): JWTPayload | null {
    try {
        const [, body] = token.split(".");
        const payload: JWTPayload = JSON.parse(atob(body));
        return payload.exp < Date.now() ? null : payload;
    } catch {
        return null;
    }
}

// ─── Store ────────────────────────────────────────────────────────────────────
type AuthState = {
    user:  User | null;
    token: string | null;
    /** Validates credentials against the DB. Returns an error string or null on success. */
    loginWithCredentials: (email: string, password: string) => Promise<string | null>;
    logout: () => void;
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user:  null,
            token: null,

            loginWithCredentials: async (email, password) => {
                const user = await authSvc.validateCredentials(email, password);
                if (!user) return "Correo o contraseña incorrectos.";
                set({ user, token: createJWT(user) });
                return null;
            },

            logout: () => set({ user: null, token: null }),
        }),
        {
            name: TOKEN_KEY,
            onRehydrateStorage: () => (state) => {
                if (state?.token && !decodeJWT(state.token)) {
                    state.user  = null;
                    state.token = null;
                }
            },
        }
    )
);
