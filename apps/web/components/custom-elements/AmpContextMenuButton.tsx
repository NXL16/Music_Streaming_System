import { useMenuStore } from "@/lib/menu/use-menu-store";
import type { MenuItemData } from "@/lib/menu/use-menu-store";
import { getContextMenuItems } from "@/lib/context-menu/get-context-menu-items";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import {
  getLibraryResources,
  getLibraryResourcesSnapshot,
  hasLibraryResourceMembership,
  isLibraryResource,
  isLibraryResourcePinned,
  subscribeLibraryResourcesChanged,
} from "@/lib/library/library-resources.api";
import {
  getAlbumFavorite,
  subscribeAlbumFavoriteChanges,
} from "@/lib/favorites/album-favorite.api";
import { subscribePlaylistFavoriteChanges } from "@/lib/favorites/playlist-favorite.api";
import { useAlbumFavoriteStore } from "@/lib/favorites/use-album-favorite-store";
import { usePlaylistFavoriteStore } from "@/lib/favorites/use-playlist-favorite-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { subscribeFavoriteChanges } from "@/lib/favorites/favorite-events";
import { subscribeArtistFollowChanges } from "@/lib/favorites/artist-follow-events";
import {
  getCatalogReleaseTrack,
  getCatalogResources,
} from "@/lib/catalog/catalog.api";
import { mapCatalogTracks } from "@/lib/catalog/catalog.mapper";
import {
  hydrateSuggestLess,
  isSuggestLessActive,
  subscribeSuggestLessChanges,
} from "@/lib/recommendations/suggest-less.api";
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
      let menuContext = context;

      if (
        context?.kind === "collection" ||
        context?.kind === "song" ||
        context?.kind === "video"
      ) {
        // Suggest Less is an independent preference projection. A temporary
        // failure there must never prevent the Library membership calculation
        // that controls Add/Delete in this menu.
        await hydrateSuggestLess().catch(() => undefined);
        try {
          // A mutation can already have applied an optimistic Library snapshot.
          // Reuse it so an open menu updates immediately rather than waiting for
          // the background revalidation request to finish.
          if (!getLibraryResourcesSnapshot()) {
            await getLibraryResources();
          }
          let albumSongIds =
            context.kind === "collection" ? context.songIds : undefined;
          // Shelf/search cards intentionally contain lightweight catalog data.
          // Their parent Album row can exist after saving only one song, so it
          // cannot decide whether the whole album is in Library. Resolve the
          // canonical release tracklist only when the caller did not provide it.
          if (
            context.kind === "collection" &&
            context.resourceType === "albums" &&
            context.sourceOrigin === "catalog" &&
            !albumSongIds?.length &&
            !context.isLibraryView
          ) {
            try {
              const album = await getCatalogResources([
                { id: context.resourceId, type: "albums" },
              ]);
              albumSongIds = mapCatalogTracks(album, {
                albumId: context.resourceId,
              }).map((track) => track.id);
            } catch {
              // A failed optional catalog lookup must not discard the Library
              // snapshot already available to this menu.
            }
          }
          menuContext =
            context.kind === "collection"
              ? {
                  ...context,
                  songIds: albumSongIds,
                  trackSources:
                    context.resourceType === "albums"
                      ? albumSongIds?.map((songId) => ({
                          songId,
                          sourceAlbumId: context.resourceId,
                        }))
                      : context.trackSources,
                  inLibrary: hasLibraryResourceMembership({
                    resourceType: context.resourceType,
                    resourceId: context.resourceId,
                    songIds: albumSongIds,
                    isLibraryAlbumView: context.isLibraryView,
                  }),
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

      // Music Video cards carry a release-track identity rather than an Album
      // id. Resolve it before building Song-derived actions so Favourite, Add
      // to Library, and Add to Playlist use the same release context as a Song
      // row. This also covers the short interval before a video playback's
      // canonical Song metadata finishes loading into the player bar.
      if (
        menuContext?.kind === "video" &&
        !menuContext.sourceAlbumId &&
        menuContext.releaseTrackId
      ) {
        const videoContext = menuContext;
        const releaseTrackId = videoContext.releaseTrackId;
        if (releaseTrackId) {
          try {
            const release = await getCatalogReleaseTrack(releaseTrackId);
            const song = mapCatalogTracks(release).find(
              (track) => track.id === videoContext.songId,
            );
            if (song?.albumId) {
              menuContext = {
                ...videoContext,
                sourceAlbumId: song.albumId,
                albumHref: song.albumUrl,
              };
            }
          } catch {
            // Queue and sharing actions remain useful if the optional release
            // lookup is temporarily unavailable.
          }
        }
      }

      if (
        menuContext?.kind === "collection" &&
        menuContext.resourceType === "albums"
      ) {
        try {
          const favoriteState = useAlbumFavoriteStore.getState();
          const isFavorite =
            favoriteState.loaded ||
            favoriteState.resolvedAlbumIds.has(menuContext.resourceId)
              ? favoriteState.albumIds.has(menuContext.resourceId)
              : await getAlbumFavorite(menuContext.resourceId);
          menuContext = {
            ...menuContext,
            isFavorite,
            isSuggestLess: isSuggestLessActive(
              "albums",
              menuContext.resourceId,
            ),
            // Album membership remains based on the complete tracklist. A
            // parent Album row created by one saved track must not show Delete.
            inLibrary: menuContext.inLibrary,
          };
        } catch {
          // The rest of the album menu stays available if the favourite state cannot load.
        }
      }

      if (
        menuContext?.kind === "collection" &&
        menuContext.resourceType === "playlists"
      ) {
        try {
          const favoriteState = usePlaylistFavoriteStore.getState();
          if (
            !favoriteState.loaded &&
            !favoriteState.resolvedPlaylistIds.has(menuContext.resourceId)
          ) {
            await favoriteState.hydrate();
          }
          menuContext = {
            ...menuContext,
            isFavorite: usePlaylistFavoriteStore
              .getState()
              .playlistIds.has(menuContext.resourceId),
            isSuggestLess: isSuggestLessActive(
              "playlists",
              menuContext.resourceId,
            ),
          };
        } catch {
          // Keep the remaining playlist menu actions available on a transient failure.
        }
      }

      if (menuContext?.kind === "song" || menuContext?.kind === "video") {
        try {
          const favoriteState = useFavoriteStore.getState();
          if (!favoriteState.loaded) await favoriteState.hydrate();
          menuContext = {
            ...menuContext,
            isFavorite: useFavoriteStore
              .getState()
              .songIds.has(menuContext.songId),
            isSuggestLess: isSuggestLessActive("songs", menuContext.songId),
          };
        } catch {
          // The song menu remains available if favourite state cannot load.
        }
      }

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
