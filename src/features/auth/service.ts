import { hashPassword } from "../../shared/lib/crypto";
import * as repo from "./repository";
import type { User } from "./types";

/**
 * Validates email + password against the users table.
 * Returns the User model on success, or null if credentials are invalid.
 */
export async function validateCredentials(
    email: string,
    password: string
): Promise<User | null> {
    const userDto = await repo.findUserByEmail(email.trim().toLowerCase());
    if (!userDto) return null;

    const hash = await hashPassword(password);
    if (hash !== userDto.hash) return null;

    return {
        id:       userDto.id,
        email:    userDto.email,
        name:     userDto.name,
        provider: "email",
    };
}
