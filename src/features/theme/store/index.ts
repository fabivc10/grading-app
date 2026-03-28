import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_KEY } from "../../../shared/constants";
import type { Theme } from "../types";

type ThemeState = {
    theme: Theme;
    toggle: () => void;
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
                ? "dark"
                : "light",
            toggle: () =>
                set((s) => {
                    const next: Theme = s.theme === "light" ? "dark" : "light";
                    document.documentElement.setAttribute("data-theme", next);
                    return { theme: next };
                }),
        }),
        { name: THEME_KEY }
    )
);
