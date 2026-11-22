import { resolveContextMenuContext } from "@/lib/context-menu/resolve-context-menu-context";
import { useMenuStore } from "@/lib/menu/use-menu-store";
import type { MenuItemData } from "@/lib/menu/use-menu-store";
import { getContextMenuItems } from "@/lib/context-menu/get-context-menu-items";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import { subscribeAlbumFavoriteChanges } from "@/lib/favorites/album-favorite.api";
import { subscribePlaylistFavoriteChanges } from "@/lib/favorites/playlist-favorite.api";
import { subscribeFavoriteChanges } from "@/lib/favorites/favorite-events";
import { subscribeArtistFollowChanges } from "@/lib/favorites/artist-follow-events";
import { subscribeSuggestLessChanges } from "@/lib/recommendations/suggest-less.api";
import { ElementType, useCallback, useEffect, useId } from "react";

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
  const openContextMenu = useCallback(
    async (triggerEl: HTMLButtonElement, refresh = false) => {
      const menuContext = await resolveContextMenuContext(context);

      // A state event can arrive while an item click is closing this menu. Do
      // not let its asynchronous refresh reopen an already-dismissed menu.
      if (
        refresh &&
        (!useMenuStore.getState().isOpen ||
          useMenuStore.getState().activeId !== menuId)
      ) {
        return;
      }

      openMenu(
        {
          id: menuId,
          items: menuContext ? getContextMenuItems(menuContext) : items,
        },
        triggerEl,
      );
    },
    [context, items, menuId, openMenu],
  );

  useEffect(() => {
    if (!isMenuOpen || !context) return;

    const refreshOpenMenu = () => {
      const triggerEl = useMenuStore.getState().triggerEl;
      if (triggerEl instanceof HTMLButtonElement) {
        void openContextMenu(triggerEl, true);
      }
    };

    // A Library Undo and Album Favourite may occur while this menu remains
    // visible. Rebuild its static actions from the newest shared state.
    const unsubscribeLibrary =
      subscribeLibraryResourcesChanged(refreshOpenMenu);
    const unsubscribeFavorite = subscribeAlbumFavoriteChanges(refreshOpenMenu);
    const unsubscribePlaylistFavorite =
      subscribePlaylistFavoriteChanges(refreshOpenMenu);
    const unsubscribeSongFavorite = subscribeFavoriteChanges(refreshOpenMenu);
    const unsubscribeArtistFollow =
      subscribeArtistFollowChanges(refreshOpenMenu);
    const unsubscribeSuggestLess = subscribeSuggestLessChanges(refreshOpenMenu);
    return () => {
      unsubscribeLibrary();
      unsubscribeFavorite();
      unsubscribePlaylistFavorite();
      unsubscribeSongFavorite();
      unsubscribeArtistFollow();
      unsubscribeSuggestLess();
    };
  }, [context, isMenuOpen, openContextMenu]);

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

          // Opening the menu must never wait on optional state projections
          // (Library, Favourite, Suggest Less, or a catalog lookup). Render
          // the deterministic actions now, then replace them once those
          // projections have settled.
          openMenu(
            {
              id: menuId,
              items: context ? getContextMenuItems(context) : items,
            },
            e.currentTarget,
          );
          void openContextMenu(e.currentTarget, true);
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
