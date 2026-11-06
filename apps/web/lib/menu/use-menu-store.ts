import { create } from "zustand";
import type { ReactNode } from "react";

export type MenuItemData = {
  /** Stable key used by React and analytics. */
  id: string;
  label: string;
  icon?: ReactNode;
  /** Internal route opened with Next client-side navigation. */
  href?: string;
  /** Runs immediately before an item navigates to its internal route. */
  onNavigate?: () => void;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  /** Keep the menu visible after selecting this item (for submenus/toggles). */
  keepOpen?: boolean;
  /** Items rendered in a nested menu beside this item. */
  children?: MenuItemData[];
  /** Existing playlists rendered beneath the submenu's Recents heading. */
  recentItems?: MenuItemData[];
  /** Fetches Recents lazily, only when this submenu opens. */
  loadRecentItems?: () => Promise<MenuItemData[]>;
};

export type OpenMenuOptions = {
  id: string;
  items: MenuItemData[];
  anchorPoint?: { x: number; y: number };
};

let preloadRequestId = 0;

async function preloadMenuItems(
  items: MenuItemData[],
): Promise<MenuItemData[]> {
  return Promise.all(
    items.map(async (item) => {
      const [children, recentItems] = await Promise.all([
        item.children ? preloadMenuItems(item.children) : undefined,
        item.loadRecentItems
          ? item.loadRecentItems().catch(() => [])
          : item.recentItems,
      ]);

      return { ...item, children, recentItems };
    }),
  );
}

type MenuState = {
  isOpen: boolean;
  activeId: string | null;
  triggerEl: HTMLElement | null;
  anchorPoint: { x: number; y: number } | null;
  items: MenuItemData[];
  openMenu: (options: OpenMenuOptions, triggerEl: HTMLElement) => void;
  closeMenu: () => void;
};

export const useMenuStore = create<MenuState>((set, get) => ({
  isOpen: false,
  activeId: null,
  triggerEl: null,
  anchorPoint: null,
  items: [],
  openMenu: ({ id, items, anchorPoint }, triggerEl) => {
    const requestId = ++preloadRequestId;
    set({
      isOpen: true,
      activeId: id,
      triggerEl,
      anchorPoint: anchorPoint ?? null,
      items,
    });

    void preloadMenuItems(items).then((preloadedItems) => {
      if (requestId !== preloadRequestId || !get().isOpen) return;
      set({ items: preloadedItems });
    });
  },
  closeMenu: () => {
    preloadRequestId += 1;
    set({
      isOpen: false,
      activeId: null,
      triggerEl: null,
      anchorPoint: null,
      items: [],
    });
  },
}));
