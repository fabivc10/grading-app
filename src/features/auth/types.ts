// ─── DTOs (raw DB row shapes) ─────────────────────────────────────────────────
export type UserDTO = {
    id: number;
    email: string;
    name: string;
    hash: string;
};

// ─── Models (domain objects used in the app) ──────────────────────────────────
export type AuthProvider = "email" | "google" | "outlook";

export type User = {
    id: number;
    email: string;
    name: string;
    provider: AuthProvider;
};

export type JWTPayload = User & { exp: number; iat: number };
