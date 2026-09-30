import { create } from "zustand";

const DEFAULT_THEME_COLOR = "#1f1f1f";

type PageThemeState = {
  baseColor: string;
  sourceKey: string | null;
  setTheme: (sourceKey: string, baseColor: string) => void;
  clearTheme: (sourceKey: string) => void;
};

export const usePageThemeStore = create<PageThemeState>((set) => ({
  baseColor: DEFAULT_THEME_COLOR,
  sourceKey: null,
  setTheme: (sourceKey, baseColor) => set({ sourceKey, baseColor }),
  // Do not clear a newer page's theme during a previous page's unmount.
  clearTheme: (sourceKey) =>
    set((state) =>
      state.sourceKey === sourceKey
        ? { sourceKey: null, baseColor: DEFAULT_THEME_COLOR }
        : state,
    ),
}));
