export type UserDTO = {
    id: number;
    email: string;
    name: string;
    hash: string;
    avatar_data: string | null;
    auth_provider: AuthProvider | null;
    external_auth_id: string | null;
};

export type AuthProvider = "email" | "google" | "outlook";
export type AuthStatus = "anonymous" | "authenticated";

export type User = {
    id: number;
    email: string;
    name: string;
    provider: AuthProvider;
    avatarData?: string;
};

export type JWTPayload = User & { exp: number; iat: number };
