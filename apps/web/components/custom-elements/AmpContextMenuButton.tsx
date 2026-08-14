import { useMenuStore } from "@/lib/menu/use-menu-store";
import type { MenuItemData } from "@/lib/menu/use-menu-store";
import { getContextMenuItems } from "@/lib/context-menu/get-context-menu-items";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import {
  getLibraryResources,
  isLibraryResource,
  isLibraryResourcePinned,
} from "@/lib/library/library-resources.api";
import { ElementType, useId } from "react";

const ICON_PATH =
  "M10.105 14c0-.87-.687-1.55-1.564-1.55-.862 0-1.557.695-1.557 1.55 0 .848.695 1.55 1.557 1.55.855 0 1.564-.702 1.564-1.55zm5.437 0c0-.87-.68-1.55-1.542-1.55A1.55 1.55 0 0012.45 14c0 .848.695 1.55 1.55 1.55.848 0 1.542-.702 1.542-1.55zm5.474 0c0-.87-.687-1.55-1.557-1.55-.87 0-1.564.695-1.564 1.55 0 .848.694 1.55 1.564 1.55.848 0 1.557-.702 1.557-1.55z";

const AmpCustomTag = "amp-contextual-menu-button" as ElementType;

type AmpContextMenuButtonProps = {
  /** Pass a domain id for components that need to react to this menu opening. */
  id?: string;
  /** The actions available for this exact button/location. */
  items?: MenuItemData[];
  /** Preferred API: a short domain context resolved by the central menu factory. */
  context?: ContextMenuContext;
  hasPlatter?: boolean;
  className?: string;
};

export default function AmpContextMenuButton({
  id,
  items = [],
  context,
  hasPlatter = false,
  className = "",
}: AmpContextMenuButtonProps) {
  const openMenu = useMenuStore((s) => s.openMenu);
  const closeMenu = useMenuStore((s) => s.closeMenu);
  const generatedId = useId();
  const menuId = id ?? generatedId;
  const isMenuOpen = useMenuStore((s) => s.isOpen && s.activeId === menuId);
  const menuItems = context ? getContextMenuItems(context) : items;

  const openContextMenu = async (triggerEl: HTMLButtonElement) => {
    let menuContext = context;

    if (context?.kind === "collection" || context?.kind === "song") {
      try {
        await getLibraryResources();
        menuContext =
          context.kind === "collection"
            ? {
                ...context,
                inLibrary: isLibraryResource(
                  context.resourceType,
                  context.resourceId,
                ),
                isPinned: isLibraryResourcePinned(
                  context.resourceType,
                  context.resourceId,
                ),
              }
            : {
                ...context,
                inLibrary: isLibraryResource("songs", context.songId),
                isPinned: isLibraryResourcePinned("songs", context.songId),
              };
      } catch {
        // The menu remains usable when membership lookup is temporarily unavailable.
      }
    }

    openMenu(
      {
        id: menuId,
        items: menuContext ? getContextMenuItems(menuContext) : menuItems,
      },
      triggerEl,
    );
  };

  return (
    <AmpCustomTag hydrated="">
      <button
        type="button"
        aria-label="more"
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (isMenuOpen) {
            closeMenu();
            return;
          }

          void openContextMenu(e.currentTarget);
        }}
        className="contextual-menu__trigger"
      >
        <span
          className={`more-button ${hasPlatter ? "more-button--platter" : "more-button--non-platter"} ${className}`}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            xmlns="http://www.w3.org/2000/svg"
          >
            {hasPlatter && (
              <circle
                fill="var(--iconCircleFill, transparent)"
                cx="14"
                cy="14"
                r="14"
              />
            )}
            <path fill="var(--iconEllipsisFill, white)" d={ICON_PATH} />
          </svg>
        </span>
      </button>
    </AmpCustomTag>
  );
}
