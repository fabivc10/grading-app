import { invoke } from "@tauri-apps/api/core";

export async function saveInstitutionIcon(code: string, dataUrl: string, oldPath?: string): Promise<string> {
    return invoke<string>("save_institution_icon", {
        code,
        dataUrl,
        oldPath: oldPath ?? null,
    });
}

export async function deleteInstitutionIcon(path?: string): Promise<void> {
    if (!path) return;
    await invoke("delete_institution_icon", { path });
}

export async function readInstitutionIcon(path?: string): Promise<string | null> {
    if (!path) return null;
    return invoke<string | null>("read_institution_icon", { path });
}
