import type { MenuItemData } from "@/lib/menu/use-menu-store";
import {
  addSourceToUserPlaylist,
  getPlaylistSourceMembership,
  getUserPlaylists,
  removeSongFromUserPlaylist,
} from "@/lib/playlists/user-playlists.api";
import { openCreatePlaylistDialog } from "@/lib/playlists/create-playlist-dialog";
import { openEditPlaylistDialog } from "@/lib/playlists/edit-playlist-dialog";
import { toggleSongFavorite } from "@/lib/favorites/toggle-song-favorite";
import { setAlbumFavorite } from "@/lib/favorites/album-favorite.api";
import { setPlaylistFavorite } from "@/lib/favorites/playlist-favorite.api";
import { setArtistFollow } from "@/lib/favorites/artist-follow.api";
import { setSuggestLess } from "@/lib/recommendations/suggest-less.api";
import { recordQueueIntent } from "@/lib/recommendations/queue-intent.api";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { enqueueContext } from "@/lib/player/enqueue-context";
import { songRoute } from "@/lib/catalog/song-route";
import { openDeleteLibraryConfirmation } from "@/lib/library/delete-library-confirmation-dialog";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { copyContextMenuLink, contextMenuPath } from "./copy-link";
import { resolvePlaylistSource } from "@/lib/playlists/resolve-playlist-source";
import {
  addLibraryResource,
  toggleLibraryResourcePin,
} from "@/lib/library/library-resources.api";
import { createElement } from "react";
import { createAndPlaySongStation } from "@/lib/recommendations/song-station";
import { createAndPlayArtistStation } from "@/lib/recommendations/artist-station";
import {
  AddToLibraryIcon,
  AddedToPlaylistIcon,
  AddToPlaylistIcon,
  CopyLinkIcon,
  CreateStationIcon,
  FavouriteIcon,
  NewPlaylistIcon,
  PlayLastIcon,
  PlayNextIcon,
  RemoveFromPlaylist,
  ShowAlbumIcon,
  SuggestLessIcon,
  UndoFavouriteIcon,
  ViewCreditsIcon,
} from "./icons";
import type {
  CollectionMenuContext,
  ContextMenuContext,
  ArtistMenuContext,
  SongMenuContext,
  StationMenuContext,
  VideoMenuContext,
} from "./types";

function addToLibraryAction(context: CollectionMenuContext): MenuItemData {
  return {
    id: "add-to-library",
    label: context.inLibrary ? "Delete from Library" : "Add to Library",
    icon: context.inLibrary ? undefined : createElement(AddToLibraryIcon),
    onClick: async () => {
      if (context.inLibrary) {
        openDeleteLibraryConfirmation({
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          sourceOrigin: context.sourceOrigin,
          songIds: context.songIds,
          trackSources: context.trackSources,
        });
        return;
      }

      try {
        await addLibraryResource({
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          title: context.title,
          subtitle: context.subtitle,
          artworkUrl: context.artworkUrl,
          sourceOrigin: context.sourceOrigin,
          songIds: context.songIds,
          trackSources: context.trackSources,
        });
        notifyMenuSuccess("Added to Library");
      } catch (error) {
        console.error("[context-menu] library", error);
        notifyMenuError("Couldn't update your library");
      }
    },
  };
}

function pinLibraryAction(context: CollectionMenuContext): MenuItemData | null {
  if (!context.inLibrary && context.sourceOrigin !== "favorite") return null;

  const resourceName = context.resourceType === "albums" ? "Album" : "Playlist";
  return {
    id: "pin-library-resource",
    label: context.isPinned ? `Unpin ${resourceName}` : `Pin ${resourceName}`,
    onClick: async () => {
      try {
        await toggleLibraryResourcePin(
          context.resourceType,
          context.resourceId,
        );
        notifyMenuSuccess(
          context.isPinned
            ? `Unpinned ${resourceName}`
            : `Pinned ${resourceName}`,
        );
      } catch (error) {
        console.error("[context-menu] pin library resource", error);
        notifyMenuError(`Couldn't update ${resourceName.toLowerCase()} pin`);
      }
    },
  };
}

function editPlaylistAction(
  context: CollectionMenuContext,
): MenuItemData | null {
  if (!context.isUserPlaylist) return null;

  return {
    id: "edit-playlist",
    label: "Edit",
    onClick: () => openEditPlaylistDialog(context),
  };
}

function removeFromPlaylistAction(
  context: SongMenuContext,
): MenuItemData | null {
  const playlistId = context.playlistId;
  if (!playlistId) return null;

  return {
    id: "remove-from-playlist",
    label: "Remove from Playlist",
    icon: createElement(RemoveFromPlaylist),
    onClick: async () => {
      try {
        await removeSongFromUserPlaylist(
          playlistId,
          context.songId,
          context.userId,
        );
        usePlayerStore
          .getState()
          .removePlaylistSong(playlistId, context.songId);
        notifyMenuSuccess("Removed from Playlist");
      } catch (error) {
        console.error("[context-menu] remove from playlist", error);
        notifyMenuError("Couldn't remove from playlist");
      }
    },
  };
}

function removeFromUpNextAction(context: SongMenuContext): MenuItemData | null {
  if (!context.queueItemId || usePlayerStore.getState().stationMode) {
    return null;
  }

  return {
    id: "remove-from-up-next",
    label: "Remove from Up Next",
    icon: createElement(RemoveFromPlaylist),
    onClick: () => {
      if (usePlayerStore.getState().stationMode) return;
      usePlayerStore.getState().removeUpcomingSong(context.queueItemId!);
      notifyMenuSuccess("Removed from Up Next");
    },
  };
}

function addToPlaylistAction(
  context: CollectionMenuContext | StationMenuContext | SongMenuContext,
): MenuItemData {
  return {
    id: "add-to-playlist",
    label: "Add to Playlist",
    icon: createElement(AddToPlaylistIcon),
    children: [
      {
        id: "new-playlist",
        label: "New Playlist",
        icon: createElement(NewPlaylistIcon),
        onClick: () => openCreatePlaylistDialog(context),
      },
    ],
    loadRecentItems: async () => {
      if (!context.userId) return [];
      const source = await resolvePlaylistSource(context).catch(() => context);
      const [playlists, addedPlaylistIds] = await Promise.all([
        getUserPlaylists(context.userId),
        getPlaylistSourceMembership(source).catch(() => new Set<string>()),
      ]);
      return playlists.map((playlist) => ({
        id: `playlist-${playlist.id}`,
        label: playlist.name,
        icon: addedPlaylistIds.has(playlist.id)
          ? createElement(AddedToPlaylistIcon)
          : undefined,
        disabled: addedPlaylistIds.has(playlist.id),
        onClick: async () => {
          try {
            await addSourceToUserPlaylist(playlist.id, source, context.userId);
            notifyMenuSuccess(`Added to ${playlist.name}`);
          } catch (error) {
            console.error("[context-menu] add to playlist", error);
            notifyMenuError("Couldn't add to playlist");
          }
        },
      }));
    },
  };
}

function queueActions(
  context:
    | CollectionMenuContext
    | StationMenuContext
    | SongMenuContext
    | VideoMenuContext,
): MenuItemData[] {
  // A Station owns and refills its queue. Manual insertions would break the
  // Station sequence, so these actions are unavailable everywhere while it
  // is active.
  if (usePlayerStore.getState().stationMode) return [];

  const recordQueueSelection = () => {
    if (context.kind === "song" || context.kind === "video") {
      recordQueueIntent("songs", context.songId);
      return;
    }
    if (context.kind === "station") {
      recordQueueIntent("stations", context.stationId);
      return;
    }
    recordQueueIntent(context.resourceType, context.resourceId);
  };

  const enqueue = async (position: "next" | "last") => {
    try {
      const enqueued = await enqueueContext(context, position);
      if (!enqueued) {
        notifyMenuError("No playable songs to add to the queue");
        return;
      }
      recordQueueSelection();
      notifyMenuSuccess(
        position === "next" ? "Playing Next" : "Added to Queue",
      );
    } catch (error) {
      console.error(`[context-menu] play ${position}`, error);
      notifyMenuError("Couldn't update queue");
    }
  };

  return [
    {
      id: "play-next",
      label: "Play Next",
      icon: createElement(PlayNextIcon),
      onClick: () => enqueue("next"),
    },
    {
      id: "play-last",
      label: "Play Last",
      icon: createElement(PlayLastIcon),
      onClick: () => enqueue("last"),
    },
  ];
}

function createArtistStationAction(context: ArtistMenuContext): MenuItemData {
  return {
    id: "create-station",
    label: "Create Station",
    icon: createElement(CreateStationIcon),
    onClick: async () => {
      try {
        if (!(await createAndPlayArtistStation(
          context.artistId,
          context.artworkUrl,
          () => notifyMenuError("Couldn't create Station artwork"),
        ))) {
          notifyMenuError("Couldn't start Station");
        }
      } catch (error) {
        console.error("[context-menu] artist station", error);
        notifyMenuError("Couldn't create Station");
      }
    },
  };
}

function createSongStationAction(context: SongMenuContext): MenuItemData {
  return {
    id: "create-station",
    label: "Create Station",
    icon: createElement(CreateStationIcon),
    onClick: async () => {
      try {
        const currentSong = usePlayerStore.getState().currentSong;
        const seedTrack =
          currentSong?.id === context.songId &&
          currentSong.releaseTrackId === context.releaseTrackId
            ? currentSong
            : undefined;
        if (
          !(await createAndPlaySongStation(
            context.songId,
            context.sourceAlbumId,
            seedTrack,
          ))
        ) {
          notifyMenuError("Couldn't start Station");
        }
      } catch (error) {
        console.error("[context-menu] song station", error);
        notifyMenuError("Couldn't create Station");
      }
    },
  };
}

function favouriteAction(context: CollectionMenuContext): MenuItemData | null {
  if (
    (context.resourceType !== "albums" && context.resourceType !== "playlists") ||
    (!context.isFavorite && context.isSuggestLess)
  )
    return null;

  const nextFavorite = !context.isFavorite;
  return {
    id: "favorite",
    label: context.isFavorite ? "Undo Favourite" : "Favourite",
    icon: createElement(context.isFavorite ? UndoFavouriteIcon : FavouriteIcon),
    onClick: async () => {
      try {
        if (context.resourceType === "albums") {
          await setAlbumFavorite(
            context.resourceId,
            nextFavorite,
            nextFavorite
              ? {
                  title: context.title,
                  subtitle: context.subtitle,
                  artworkUrl: context.artworkUrl,
                  sourceOrigin: context.sourceOrigin,
                  songIds: context.songIds,
                  trackSources: context.trackSources,
                }
              : undefined,
          );
        } else {
          await setPlaylistFavorite(
            context.resourceId,
            nextFavorite,
            nextFavorite
              ? {
                  title: context.title,
                  subtitle: context.subtitle,
                  artworkUrl: context.artworkUrl,
                  sourceOrigin: context.sourceOrigin,
                  songIds: context.songIds,
                  trackSources: context.trackSources,
                }
              : undefined,
          );
        }
        notifyMenuSuccess(nextFavorite ? "Added to Favourites" : "Removed from Favourites");
      } catch (error) {
        console.error("[context-menu] collection favourite", error);
        notifyMenuError("Couldn't update favourites");
      }
    },
  };
}

function suggestLessAction(
  context: CollectionMenuContext | SongMenuContext,
): MenuItemData | null {
  // Favourite is an explicit strong positive preference. Do not present the
  // contradictory negative action while that state is active.
  if (context.isFavorite) return null;
  const resourceType = context.kind === "song" ? "songs" : context.resourceType;
  const resourceId = context.kind === "song" ? context.songId : context.resourceId;
  const isActive = Boolean(context.isSuggestLess);
  return {
    id: "suggest-less",
    label: isActive ? "Undo Suggest Less" : "Suggest Less",
    icon: createElement(SuggestLessIcon),
    onClick: async () => {
      try {
        await setSuggestLess(resourceType, resourceId, !isActive);
        notifyMenuSuccess(isActive ? "Suggestions restored" : "We'll suggest less like this");
      } catch (error) {
        console.error("[context-menu] suggest less", error);
        notifyMenuError("Couldn't update suggestions");
      }
    },
  };
}

function viewCreditsAction(context: SongMenuContext): MenuItemData {
  return {
    id: "view-credits",
    label: "View Credits",
    icon: createElement(ViewCreditsIcon),
    href: songRoute(context.title, context.releaseTrackId!),
  };
}

function copyLinkAction(context: ContextMenuContext): MenuItemData {
  return {
    id: "copy-link",
    label: "Copy Link",
    icon: createElement(CopyLinkIcon),
    disabled: !contextMenuPath(context),
    onClick: async () => {
      const copied = await copyContextMenuLink(context);
      if (copied) {
        notifyMenuSuccess("Link copied");
      } else {
        notifyMenuError("Couldn't copy link");
      }
    },
  };
}

function buildCollectionMenu(context: CollectionMenuContext): MenuItemData[] {
  const pinAction = pinLibraryAction(context);
  const editAction = editPlaylistAction(context);
  const favoriteAction = favouriteAction(context);
  const suggestLess = suggestLessAction(context);
  const isFavoritePlaylist = context.sourceOrigin === "favorite";
  return [
    ...(editAction ? [editAction] : []),
    ...(pinAction ? [pinAction] : []),
    ...(isFavoritePlaylist ? [] : [addToLibraryAction(context)]),
    addToPlaylistAction(context),
    ...queueActions(context),
    ...(favoriteAction ? [favoriteAction] : []),
    ...(suggestLess ? [suggestLess] : []),
    copyLinkAction(context),
  ];
}

function buildStationMenu(context: StationMenuContext): MenuItemData[] {
  return [copyLinkAction(context)];
}

function buildArtistMenu(context: ArtistMenuContext): MenuItemData[] {
  const nextFavorite = !context.isFavorite;
  return [
    createArtistStationAction(context),
    {
      id: "favorite",
      label: context.isFavorite ? "Undo Favourite" : "Favourite",
      icon: createElement(
        context.isFavorite ? UndoFavouriteIcon : FavouriteIcon,
      ),
      onClick: async () => {
        try {
          const isFavorite = await setArtistFollow(
            context.artistId,
            nextFavorite,
          );
          notifyMenuSuccess(
            isFavorite ? "Added to Favourites" : "Removed from Favourites",
          );
        } catch (error) {
          console.error("[context-menu] artist favourite", error);
          notifyMenuError("Couldn't update favourites");
        }
      },
    },
    copyLinkAction(context),
  ];
}

function buildSongMenu(context: SongMenuContext): MenuItemData[] {
  const removeFromUpNext = removeFromUpNextAction(context);
  const removeFromPlaylist = removeFromPlaylistAction(context);
  const showAlbum = context.albumHref
    ? {
        id: "show-album",
        label: "Show Album",
        icon: createElement(ShowAlbumIcon),
        href: context.albumHref,
      }
    : null;
  const pinAction = context.inLibrary
    ? {
        id: "pin-library-song",
        label: context.isPinned ? "Unpin Song" : "Pin Song",
        onClick: async () => {
          try {
            await toggleLibraryResourcePin("songs", context.songId);
            notifyMenuSuccess(
              context.isPinned ? "Song unpinned" : "Song pinned",
            );
          } catch (error) {
            console.error("[context-menu] pin song", error);
            notifyMenuError("Couldn't update song pin");
          }
        },
      }
    : null;
  const suggestLess = suggestLessAction(context);
  return [
    ...(removeFromUpNext ? [removeFromUpNext] : []),
    ...(removeFromPlaylist ? [removeFromPlaylist] : []),
    ...(pinAction ? [pinAction] : []),
    {
      id: "add-to-library",
      label: context.inLibrary ? "Delete from Library" : "Add to Library",
      icon: context.inLibrary ? undefined : createElement(AddToLibraryIcon),
      onClick: async () => {
        if (context.inLibrary) {
          openDeleteLibraryConfirmation({
            resourceType: "songs",
            resourceId: context.songId,
            sourceAlbumId: context.sourceAlbumId,
          });
          return;
        }

        try {
          await addLibraryResource({
            resourceType: "songs",
            resourceId: context.songId,
            title: context.title,
            subtitle: context.subtitle,
            artworkUrl: context.artworkUrl,
            sourceAlbumId: context.sourceAlbumId,
          });
          notifyMenuSuccess("Added to Library");
        } catch (error) {
          console.error("[context-menu] song library", error);
          notifyMenuError("Couldn't update your library");
        }
      },
    },
    addToPlaylistAction(context),
    ...queueActions(context),
    createSongStationAction(context),
    ...(context.isSuggestLess && !context.isFavorite
      ? []
      : [
          {
            id: "favourite",
            label: context.isFavorite ? "Undo Favourite" : "Favourite",
            icon: createElement(
              context.isFavorite ? UndoFavouriteIcon : FavouriteIcon,
            ),
            onClick: async () => {
              await toggleSongFavorite(context.songId, context.sourceAlbumId);
            },
          },
        ]),
    ...(suggestLess ? [suggestLess] : []),
    ...(showAlbum ? [showAlbum] : []),
    ...(context.releaseTrackId ? [viewCreditsAction(context)] : []),
    copyLinkAction(context),
  ];
}

function viewMusicVideoCreditsAction(
  context: VideoMenuContext,
): MenuItemData {
  return {
    id: "view-credits",
    label: "View Credits",
    icon: createElement(ViewCreditsIcon),
    // A Music Video has its own detail page. This row intentionally does not
    // open the Song's release-track credits surface.
    href: context.href,
  };
}

function buildVideoMenu(context: VideoMenuContext): MenuItemData[] {
  const songItems = buildSongMenu({ ...context, kind: "song" });
  const videoQueueActions = queueActions(context);
  const items = songItems.filter(
      (item) =>
        item.id !== "create-station" &&
        item.id !== "view-credits" &&
        item.id !== "show-album" &&
        item.id !== "copy-link" &&
        item.id !== "play-next" &&
        item.id !== "play-last",
    );
  const addToPlaylistIndex = items.findIndex(
    (item) => item.id === "add-to-playlist",
  );
  items.splice(addToPlaylistIndex + 1, 0, ...videoQueueActions);
  items.push(viewMusicVideoCreditsAction(context));
  items.push(copyLinkAction(context));
  return items;
}

export function getContextMenuItems(
  context: ContextMenuContext,
): MenuItemData[] {
  switch (context.kind) {
    case "collection":
      return buildCollectionMenu(context);
    case "station":
      return buildStationMenu(context);
    case "artist":
      return buildArtistMenu(context);
    case "song":
      return buildSongMenu(context);
    case "video":
      return buildVideoMenu(context);
  }
}
