import { supabase } from "../../../shared/lib/supabase";
import { getOAuthRedirectUrl } from "../services/shared/auth-config";

export async function signInWithGoogleProvider(): Promise<{ url: string | null; error: string | null }> {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: getOAuthRedirectUrl(),
            scopes: "openid profile email",
            skipBrowserRedirect: true,
        },
    });

    return {
        url: data?.url ?? null,
        error: error ? error.message : null,
    };
}
