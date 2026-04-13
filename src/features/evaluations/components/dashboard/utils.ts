import type { EvalEntry, EvalCategory, TemaItem } from "../../types";
import type { DashboardCategoryConfig } from "./types";

export const DEFAULT_DASHBOARD_CATEGORIES: DashboardCategoryConfig[] = [
    { key: "cotidiano", label: "Trabajo Cotidiano", maxPoints: 20 },
    { key: "tareas", label: "Tareas", maxPoints: 20 },
    { key: "prueba", label: "Prueba", maxPoints: 40 },
    { key: "proyecto", label: "Proyecto", maxPoints: 10 },
];

export function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function getToneByCategory(category: EvalCategory): "green" | "yellow" | "gray" | "violet" {
    switch (category) {
        case "tareas":
            return "green";
        case "prueba":
            return "yellow";
        case "proyecto":
            return "violet";
        default:
            return "gray";
    }
}

export function getItemEarned(item: TemaItem) {
    return clamp(item.nota, 0, item.valor);
}

export function getEntryEarned(entry: EvalEntry) {
    return entry.items.reduce((sum, item) => sum + getItemEarned(item), 0);
}

export function getEntryMax(entry: EvalEntry) {
    return entry.items.reduce((sum, item) => sum + item.valor, 0);
}

export function getCategoryEarned(entries: EvalEntry[]) {
    return entries.reduce((sum, entry) => sum + Math.min(getEntryEarned(entry), entry.pct), 0);
}

export function getCategoryProgress(entries: EvalEntry[], maxPoints: number) {
    if (maxPoints <= 0) return 0;
    return Math.round((getCategoryEarned(entries) / maxPoints) * 100);
}
