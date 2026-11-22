import { librarySongKey } from "@/lib/library/library-song-key";
import Link from "next/link";
import CollectionCardMetadata from "./collection-card-metadata";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import CardContextMenu from "./common/card-context-menu";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
import { playLibraryAlbums } from "@/lib/library/play-library-albums";
import { notifyMenuError } from "@/lib/notifications/menu-toast";
import { getMediaCardMenuContext } from "@/lib/context-menu/media-card-menu-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import { playUserPlaylist } from "@/lib/playlists/play-user-playlist";
import { playFavoritePlaylist } from "@/lib/favorites/play-favorite-playlist";
import { useAlbumFavoriteStore } from "@/lib/favorites/use-album-favorite-store";
import { usePlaylistFavoriteStore } from "@/lib/favorites/use-playlist-favorite-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useEffect, useState } from "react";
import {
  hydrateSuggestLess,
  isSuggestLessActive,
  subscribeSuggestLessChanges,
} from "@/lib/recommendations/suggest-less.api";

type CollectionCardProps = MediaCardProps & {
  cardType: "collection";
};

export default function CollectionCard(props: CollectionCardProps) {
  const cardId = props.resourceId || props.id;
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteAlbumIds = useAlbumFavoriteStore((state) => state.albumIds);
  const hydrateFavoriteAlbums = useAlbumFavoriteStore((state) => state.hydrate);
  const favoritePlaylistIds = usePlaylistFavoriteStore(
    (state) => state.playlistIds,
  );
  const hydrateFavoritePlaylists = usePlaylistFavoriteStore(
    (state) => state.hydrate,
  );
  const musicVideoSongId =
    props.menuContext?.kind === "video" ? props.menuContext.songId : undefined;
  const isMusicVideoFavorite = useFavoriteStore((state) =>
    musicVideoSongId
      ? state.songKeys.has(
          librarySongKey(
            musicVideoSongId,
            props.menuContext?.kind === "video"
              ? props.menuContext.sourceAlbumId
              : undefined,
          ),
        )
      : false,
  );
  const [isSuggestLess, setIsSuggestLess] = useState(false);
  useEffect(() => {
    if (userId && props.resourceType === "albums") {
      void hydrateFavoriteAlbums();
    }
  }, [hydrateFavoriteAlbums, props.resourceType, userId]);
  useEffect(() => {
    if (userId && props.resourceType === "playlists") {
      void hydrateFavoritePlaylists();
    }
  }, [hydrateFavoritePlaylists, props.resourceType, userId]);
  useEffect(() => {
    if (props.resourceType !== "albums") return;
    const sync = () => setIsSuggestLess(isSuggestLessActive("albums", cardId));
    void hydrateSuggestLess()
      .then(sync)
      .catch(() => undefined);
    return subscribeSuggestLessChanges((detail) => {
      if (detail.resourceType === "albums" && detail.resourceId === cardId)
        sync();
    });
  }, [cardId, props.resourceType]);
  const menuContext = getMediaCardMenuContext(props, userId);

  return (
    <MediaCardShell
      id={cardId}
      artworkColor={props.artworkColors.main}
      href={props.slug}
      onOpen={props.onOpen}
    >
      <>
        <div className="media-card-artwork">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageSrcSet={props.imageSrcSet}
            aspectRatio={props.artworkAspectRatio}
            artworkColors={props.artworkColors}
            containerClassName="w-full [--override-placeholder-bg-color:var(--artwork-bg-color)] [anchor-name:--shelf-first-artwork]"
          />

          <div className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)] pointer-coarse:invisible">
            {props.slug && (
              <Link
                className="text-transparent block size-full absolute inset-0 z-(--z-default) wrap-break-word"
                href={props.slug}
                onPointerDown={(event) => {
                  if (event.button === 0) props.onOpen?.();
                }}
                onClick={(event) => {
                  if (event.detail === 0) props.onOpen?.();
                }}
              >
                {props.title}
              </Link>
            )}

            {!props.slug && props.onOpen && (
              <button
                type="button"
                aria-label={props.title}
                className="absolute inset-0 size-full rounded-[inherit]"
                onClick={props.onOpen}
              />
            )}

            {props.resourceType !== "user-playlist" && (
              <CardPlayButton
                ariaLabel={`Play ${props.title}`}
                variant="cover"
                onPlay={() => {
                  props.onPlay?.();
                  if (
                    props.resourceType === "albums" &&
                    props.slug?.startsWith("/library/albums/")
                  ) {
                    void playLibraryAlbums([props.resourceId])
                      .then((played) => {
                        if (!played)
                          notifyMenuError("No saved songs available to play.");
                      })
                      .catch(() =>
                        notifyMenuError("Could not play your saved music."),
                      );
                    return;
                  }
                  if (props.playlistKind === "favorite") {
                    void playFavoritePlaylist({
                      title: props.title,
                      curatorName: props.subtitle,
                      artworkUrl: props.imageUrl,
                      artworkBgColor: props.artworkColors.main,
                    });
                    return;
                  }

                  if (
                    props.resourceType === "playlists" &&
                    props.isUserPlaylist
                  ) {
                    void playUserPlaylist({
                      id: props.resourceId,
                      title: props.title,
                      curatorName: props.subtitle,
                      artworkUrl: props.imageUrl,
                      artworkBgColor: props.artworkColors.main,
                      href: props.slug,
                    });
                    return;
                  }

                  void playCatalogResource(
                    props.resourceType,
                    props.resourceId,
                  );
                }}
              />
            )}

            {(menuContext || props.menuItems) && (
              <CardContextMenu
                id={cardId}
                context={menuContext}
                items={props.menuItems}
              />
            )}
          </div>
        </div>

        <CollectionCardMetadata
          {...props}
          isFavorite={
            (props.resourceType === "albums" &&
              favoriteAlbumIds.has(props.resourceId) &&
              !isSuggestLess) ||
            (props.resourceType === "playlists" &&
              favoritePlaylistIds.has(props.resourceId)) ||
            (props.resourceType === "music-videos" && isMusicVideoFavorite)
          }
        />
      </>
    </MediaCardShell>
  );
}
