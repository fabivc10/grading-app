import { create } from "zustand";
import type { User } from "../../auth/types";
import { evaluateAccess, unlockWithAccessCode } from "../services/access.service";

type AccessStatus = "idle" | "checking" | "granted" | "payment_required" | "blocked" | "degraded";

type AccessState = {
    status: AccessStatus;
    message: string;
    publicAccountId: string;
    accessCode: string;
    lastPaymentDate: string;
    lastAccessDate: string;
    error: string;
    accessCodeError: string;
    accessCodeBusy: boolean;
    checkAccess: (user: User) => Promise<void>;
    submitAccessCode: (user: User, code: string) => Promise<void>;
    reset: () => void;
};

const initialState = {
    status: "idle" as AccessStatus,
    message: "",
    publicAccountId: "",
    accessCode: "",
    lastPaymentDate: "",
    lastAccessDate: "",
    error: "",
    accessCodeError: "",
    accessCodeBusy: false,
};

export const useAccessStore = create<AccessState>((set) => ({
    ...initialState,
    checkAccess: async (user) => {
        set({ status: "checking", error: "", message: "Verificando acceso...", accessCodeError: "" });
        try {
            const result = await evaluateAccess(user);
            set((state) => ({
                ...state,
                status: result.status,
                message: result.message,
                publicAccountId: result.publicAccountId,
                accessCode: result.accessCode,
                lastPaymentDate: result.lastPaymentDate,
                lastAccessDate: result.lastAccessDate,
                error: "",
                accessCodeError: "",
            }));
        } catch (error) {
            console.error("[access] remote validation failed:", error);
            set((state) => ({
                ...state,
                status: "degraded",
                message: "No pudimos validar el estado remoto de pagos. Ingresa tu codigo de acceso o cierra sesion.",
                publicAccountId: "",
                accessCode: "",
                lastPaymentDate: "",
                lastAccessDate: "",
                error: "",
                accessCodeError: "",
            }));
        }
    },
    submitAccessCode: async (user, code) => {
        set((state) => ({ ...state, accessCodeBusy: true, accessCodeError: "" }));
        try {
            const result = await unlockWithAccessCode(user, code);
            set((state) => ({
                ...state,
                status: result.status,
                message: result.message,
                publicAccountId: result.publicAccountId,
                accessCode: result.accessCode,
                lastPaymentDate: result.lastPaymentDate,
                lastAccessDate: result.lastAccessDate,
                error: "",
                accessCodeError: "",
                accessCodeBusy: false,
            }));
        } catch (error) {
            set((state) => ({
                ...state,
                accessCodeBusy: false,
                accessCodeError: error instanceof Error ? error.message : "No fue posible validar el codigo.",
            }));
        }
    },
    reset: () => set(initialState),
}));
