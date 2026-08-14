"use client";

import {
  ElementType,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import M404ContextualMenuScrim from "./m404-contextual-menu-scrim";
import M404ContextualMenuItem from "./m404-contextual-menu-item";
import { useMenuStore } from "@/lib/menu/use-menu-store";
import type { MenuItemData } from "@/lib/menu/use-menu-store";

const M404CustomTag = "m404-contextual-menu" as ElementType;

type MenuConfig = {
  padding?: number;
};

type M404ContextualMenuProps = {
  /** Renders only the nested-menu structure; it never subscribes to menu state. */
  nested?: boolean;
  items?: MenuItemData[];
  recentItems?: MenuItemData[];
  title?: string;
};

let contextMenuPortalHost: HTMLElement | null = null;
const contextMenuPortalListeners = new Set<() => void>();

function setContextMenuPortalHost(host: HTMLElement | null) {
  if (contextMenuPortalHost === host) return;
  contextMenuPortalHost = host;
  contextMenuPortalListeners.forEach((listener) => listener());
}

function subscribeToContextMenuPortalHost(listener: () => void) {
  contextMenuPortalListeners.add(listener);
  return () => contextMenuPortalListeners.delete(listener);
}

function getContextMenuPortalHost() {
  return contextMenuPortalHost;
}

/**
 * Place this where the root menu should live while a modal/detail view is open.
 * The single root menu remains mounted in app/layout.tsx.
 */
export function M404ContextualMenuPortalHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setContextMenuPortalHost(host);

    return () => {
      if (contextMenuPortalHost === host) {
        setContextMenuPortalHost(null);
      }
    };
  }, []);

  return <div ref={hostRef} data-context-menu-portal-host />;
}

function calculateMenuPosition(
  triggerEl: HTMLElement,
  menuEl: HTMLElement,
  config: MenuConfig = {},
) {
  const { padding = 12 } = config;

  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = menuEl.offsetWidth;
  const menuHeight = menuEl.offsetHeight;
  const { innerWidth: viewportWidth, innerHeight: viewportHeight } = window;

  const OVERLAP_X = 16;
  const OFFSET_Y = 18;

  let left = rect.right - OVERLAP_X;

  if (left + menuWidth > viewportWidth - padding) {
    left = rect.left - menuWidth + OVERLAP_X;
  }

  let top: number | undefined = rect.top + OFFSET_Y;
  let bottom: number | undefined = undefined;

  if (top + menuHeight > viewportHeight - padding) {
    top = undefined;
    bottom = viewportHeight - rect.bottom + OFFSET_Y;
  }

  if (top !== undefined) {
    top = Math.max(
      padding,
      Math.min(top, viewportHeight - menuHeight - padding),
    );
  }
  left = Math.max(padding, Math.min(left, viewportWidth - menuWidth - padding));

  return {
    left: Math.round(left),
    top: top !== undefined ? Math.round(top) : undefined,
    bottom: bottom !== undefined ? Math.round(bottom) : undefined,
  };
}

function MenuItemList({
  items,
  keyPrefix = "",
}: {
  items: MenuItemData[];
  keyPrefix?: string;
}) {
  return (
    <>
      {items.map((item) => (
        <M404ContextualMenuItem key={`${keyPrefix}:${item.id}`} item={item} />
      ))}
    </>
  );
}

function NestedContextualMenu({
  items,
  recentItems = [],
  title,
}: Required<Pick<M404ContextualMenuProps, "items">> &
  Pick<M404ContextualMenuProps, "title" | "recentItems">) {
  return (
    <M404CustomTag hydrated="">
      <div className="contextual-menu__overlay">
        <div className="contextual-menu contextual-menu--in-submenu contextual-menu--nested">
          <ul className="contextual-menu__list" role="menu">
            {title && (
              <li className="contextual-menu-item contextual-menu__subhead">
                <button type="button" tabIndex={-1}>
                  <span>{title}</span>
                </button>
              </li>
            )}

            <div className="contextual-menu__group">
              <MenuItemList items={items} />
            </div>

            {recentItems.length > 0 && (
              <div className="contextual-menu__group">
                <span className="contextual-menu__group-title">Recents</span>
                <MenuItemList items={recentItems} />
              </div>
            )}
          </ul>
        </div>
      </div>
    </M404CustomTag>
  );
}

function RootContextualMenu() {
  const { isOpen, activeId, triggerEl, closeMenu, items } = useMenuStore();

  const rootRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalHost = useSyncExternalStore(
    subscribeToContextMenuPortalHost,
    getContextMenuPortalHost,
    () => null,
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };

    const handleResize = () => closeMenu();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    // window.addEventListener("blur", handleBlur);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      // window.removeEventListener("blur", handleBlur);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen, closeMenu]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerEl || !menuRef.current || !rootRef.current) return;

    const pos = calculateMenuPosition(triggerEl, menuRef.current, {
      padding: 12,
    });

    const style = rootRef.current.style;
    style.setProperty("--ctxmenu-left", `${pos.left}px`);

    if (pos.top !== undefined) {
      style.setProperty("--ctxmenu-top", `${pos.top}px`);
      style.removeProperty("--ctxmenu-bottom");
    } else if (pos.bottom !== undefined) {
      style.setProperty("--ctxmenu-bottom", `${pos.bottom}px`);
      style.removeProperty("--ctxmenu-top");
    }
  }, [isOpen, triggerEl, items]);

  if (!isOpen) return null;

  const menu = (
    <M404CustomTag ref={rootRef} hydrated="">
      <div className="contextual-menu__overlay">
        <M404ContextualMenuScrim onClick={closeMenu} />

        <div ref={menuRef} className="contextual-menu">
          <ul className="contextual-menu__list">
            <MenuItemList items={items} keyPrefix={activeId ?? ""} />
          </ul>
        </div>
      </div>
    </M404CustomTag>
  );

  return portalHost ? createPortal(menu, portalHost) : menu;
}

export default function M404ContextualMenu({
  nested = false,
  items = [],
  recentItems,
  title,
}: M404ContextualMenuProps) {
  if (nested) {
    return (
      <NestedContextualMenu
        items={items}
        recentItems={recentItems}
        title={title}
      />
    );
  }

  return <RootContextualMenu />;
}
