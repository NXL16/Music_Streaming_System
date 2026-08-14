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
  toggleLibraryResource,
  toggleLibraryResourcePin,
} from "@/lib/library/library-resources.api";
import { createElement } from "react";
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
  SuggestLessIcon,
  UndoFavouriteIcon,
  ViewCreditsIcon,
} from "./icons";
import type {
  CollectionMenuContext,
  ContextMenuContext,
  SongMenuContext,
  StationMenuContext,
} from "./types";

function notifyFeatureUnavailable() {
  notifyMenuError("This feature isn't available yet");
}

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
        });
        return;
      }

      try {
        await toggleLibraryResource({
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          title: context.title,
          subtitle: context.subtitle,
          artworkUrl: context.artworkUrl,
          sourceOrigin: context.sourceOrigin,
          songIds: context.songIds,
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
  if (!context.queueItemId) return null;

  return {
    id: "remove-from-up-next",
    label: "Remove from Up Next",
    icon: createElement(RemoveFromPlaylist),
    onClick: () => {
      usePlayerStore.getState().removeUpcomingSong(context.queueItemId!);
      notifyMenuSuccess("Removed from Up Next");
    },
  };
}

function addToPlaylistAction(context: ContextMenuContext): MenuItemData {
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

function queueActions(context: ContextMenuContext): MenuItemData[] {
  const enqueue = async (position: "next" | "last") => {
    try {
      await enqueueContext(context, position);
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

function createStationAction(): MenuItemData {
  return {
    id: "create-station",
    label: "Create Station",
    icon: createElement(CreateStationIcon),
    onClick: notifyFeatureUnavailable,
  };
}

function favouriteAction(): MenuItemData {
  return {
    id: "favorite",
    label: "Favourite",
    icon: createElement(FavouriteIcon),
    onClick: notifyFeatureUnavailable,
  };
}

function suggestLessAction(): MenuItemData {
  return {
    id: "suggest-less",
    label: "Suggest Less",
    icon: createElement(SuggestLessIcon),
    onClick: notifyFeatureUnavailable,
  };
}

function viewCreditsAction(context: SongMenuContext): MenuItemData {
  return {
    id: "view-credits",
    label: "View Credits",
    icon: createElement(ViewCreditsIcon),
    href: songRoute(context.songId),
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
  const isFavoritePlaylist = context.sourceOrigin === "favorite";
  return [
    ...(editAction ? [editAction] : []),
    ...(pinAction ? [pinAction] : []),
    ...(isFavoritePlaylist ? [] : [addToLibraryAction(context)]),
    addToPlaylistAction(context),
    ...queueActions(context),
    favouriteAction(),
    suggestLessAction(),
    copyLinkAction(context),
  ];
}

function buildStationMenu(context: StationMenuContext): MenuItemData[] {
  return [copyLinkAction(context)];
}

function buildSongMenu(context: SongMenuContext): MenuItemData[] {
  const removeFromUpNext = removeFromUpNextAction(context);
  const removeFromPlaylist = removeFromPlaylistAction(context);
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
          });
          return;
        }

        try {
          await toggleLibraryResource({
            resourceType: "songs",
            resourceId: context.songId,
            title: context.title,
            subtitle: context.subtitle,
            artworkUrl: context.artworkUrl,
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
    createStationAction(),
    {
      id: "favourite",
      label: context.isFavorite ? "Undo Favourite" : "Favourite",
      icon: createElement(
        context.isFavorite ? UndoFavouriteIcon : FavouriteIcon,
      ),
      onClick: async () => {
        await toggleSongFavorite(context.songId);
      },
    },
    suggestLessAction(),
    viewCreditsAction(context),
    copyLinkAction(context),
  ];
}

export function getContextMenuItems(
  context: ContextMenuContext,
): MenuItemData[] {
  switch (context.kind) {
    case "collection":
      return buildCollectionMenu(context);
    case "station":
      return buildStationMenu(context);
    case "song":
      return buildSongMenu(context);
  }
}
