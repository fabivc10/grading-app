import { invoke } from "@tauri-apps/api/core";

function canUseTauriInvoke() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveProfilePicture(userKey: string, dataUrl: string, oldPath?: string): Promise<string> {
    if (!canUseTauriInvoke()) return dataUrl;
    return invoke<string>("save_profile_picture", {
        userKey,
        dataUrl,
        oldPath: oldPath ?? null,
    });
}

export async function downloadProfilePicture(userKey: string, imageUrl: string, oldPath?: string): Promise<string> {
    if (!canUseTauriInvoke()) return oldPath ?? imageUrl;
    return invoke<string>("download_profile_picture", {
        userKey,
        imageUrl,
        oldPath: oldPath ?? null,
    });
}

export async function readProfilePicture(path?: string): Promise<string | null> {
    if (!path) return null;
    if (!canUseTauriInvoke()) return path.startsWith("data:") ? path : null;
    return invoke<string | null>("read_profile_picture", { path });
}

export async function deleteProfilePicture(path?: string): Promise<void> {
    if (!path) return;
    if (!canUseTauriInvoke()) return;
    await invoke("delete_profile_picture", { path });
}
