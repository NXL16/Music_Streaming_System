import { create } from "zustand";

type SidebarActiveItemState = {
  key: string | null;
  select: (key: string) => void;
};

export const useSidebarActiveItem = create<SidebarActiveItemState>((set) => ({
  key: null,
  select: (key) => set({ key }),
}));
