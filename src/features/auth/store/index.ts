import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import * as authSessionRepo from "../repositories/auth-session.repository";
import * as authUserService from "../services/shared/auth-user.service";
import * as localAuthRepo from "../repositories/auth-user.repository";
import type { AuthProvider, AuthStatus, User } from "../types";

type AuthState = {
    user: User | null;
    status: AuthStatus;
    activeProvider: AuthProvider | null;
    hydrated: boolean;
    setAuth: (user: User) => void;
    setActiveProvider: (provider: AuthProvider | null) => void;
    clearAuth: () => void;
    hydrateFromLocalSession: () => Promise<void>;
};

const WEB_LOCAL_USER_EMAIL = "admin@grading.app";

const anonymousState = {
    user: null,
    status: "anonymous" as AuthStatus,
    activeProvider: null,
};

export const useAuthStore = create<AuthState>((set) => ({
    ...anonymousState,
    hydrated: false,

    setAuth: (user) => set({
        user,
        status: "authenticated",
        activeProvider: user.provider,
        hydrated: true,
    }),

    setActiveProvider: (provider) => set({ activeProvider: provider }),

    clearAuth: () => set({
        ...anonymousState,
        hydrated: true,
    }),

    hydrateFromLocalSession: async () => {
        try {
            // The web build has no login: it always runs as the local default user.
            const userId = isTauri()
                ? await authSessionRepo.findActiveSessionUserId()
                : (await localAuthRepo.findUserByEmail(WEB_LOCAL_USER_EMAIL))?.id;
            if (!userId) {
                set({ ...anonymousState, hydrated: true });
                return;
            }

            const user = await authUserService.fetchUserById(userId);
            if (!user) {
                await authSessionRepo.clearActiveSession();
                set({ ...anonymousState, hydrated: true });
                return;
            }

            set({
                user,
                status: "authenticated",
                activeProvider: user.provider,
                hydrated: true,
            });
        } catch (error) {
            console.error("[auth] failed to hydrate local session:", error);
            set({ ...anonymousState, hydrated: true });
        }
    },
}));
