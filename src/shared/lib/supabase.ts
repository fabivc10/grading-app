import { isTauri } from "@tauri-apps/api/core";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL ?? "https://jnixzwsnbyjsvvpvhtem.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_LqDlil12QkihMK45sA-bJw_tFjiwvkv";

const AUTH_FLOW_TYPE: "implicit" | "pkce" =
    isTauri() || import.meta.env.VITE_SUPABASE_AUTH_FLOW_TYPE === "implicit"
        ? "implicit"
        : "pkce";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        flowType: AUTH_FLOW_TYPE,
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
    },
});
