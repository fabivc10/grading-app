import { supabase } from "../../../shared/lib/supabase";
import { getEmailRedirectUrl } from "../services/shared/auth-config";

export async function signInWithPasswordProvider(email: string, password: string) {
    return supabase.auth.signInWithPassword({
        email,
        password,
    });
}

export async function signUpWithPasswordProvider(
    name: string,
    email: string,
    password: string
) {
    return supabase.auth.signUp({
        email,
        password,
        options: {
            data: { name },
            emailRedirectTo: getEmailRedirectUrl(),
        },
    });
}

export async function updatePasswordWithProvider(password: string) {
    return supabase.auth.updateUser({ password });
}
