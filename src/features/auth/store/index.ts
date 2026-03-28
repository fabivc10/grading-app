import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TOKEN_KEY } from "../../../shared/constants";
import type { AuthProvider, AuthStatus, JWTPayload, User } from "../types";

function createJWT(user: User): string {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
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

type AuthState = {
    user: User | null;
    token: string | null;
    status: AuthStatus;
    activeProvider: AuthProvider | null;
    setAuth: (user: User) => void;
    setActiveProvider: (provider: AuthProvider | null) => void;
    clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            status: "anonymous",
            activeProvider: null,

            setAuth: (user) => set({
                user,
                token: createJWT(user),
                status: "authenticated",
                activeProvider: user.provider,
            }),

            setActiveProvider: (provider) => set({ activeProvider: provider }),

            clearAuth: () => set({
                user: null,
                token: null,
                status: "anonymous",
                activeProvider: null,
            }),
        }),
        {
            name: TOKEN_KEY,
            onRehydrateStorage: () => (state) => {
                if (!state) return;

                if (!state.token) {
                    state.user = null;
                    state.status = "anonymous";
                    state.activeProvider = null;
                    return;
                }

                const payload = decodeJWT(state.token);
                if (!payload) {
                    state.user = null;
                    state.token = null;
                    state.status = "anonymous";
                    state.activeProvider = null;
                    return;
                }

                state.user = {
                    id: payload.id,
                    email: payload.email,
                    name: payload.name,
                    provider: payload.provider,
                    avatarData: payload.avatarData,
                };
                state.status = "authenticated";
                state.activeProvider = payload.provider;
            },
        }
    )
);
