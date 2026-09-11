import Link from "next/link";
import CollectionCardMetadata from "./collection-card-metadata";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import CardContextMenu from "./common/card-context-menu";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
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
    musicVideoSongId ? state.songIds.has(musicVideoSongId) : false,
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
    void hydrateSuggestLess().then(sync).catch(() => undefined);
    return subscribeSuggestLessChanges((detail) => {
      if (detail.resourceType === "albums" && detail.resourceId === cardId) sync();
    });
  }, [cardId, props.resourceType]);
  const libraryResourceType =
    props.resourceType === "albums" || props.resourceType === "playlists"
      ? props.resourceType
      : null;
  const collectionMenuContext =
    libraryResourceType === "playlists" && props.playlistKind === "favorite"
      ? {
          kind: "collection" as const,
          resourceId: props.resourceId,
          resourceType: "playlists" as const,
          sourceOrigin: "favorite" as const,
          title: props.title,
          subtitle: props.subtitle,
          artworkUrl: props.imageUrl,
          href: props.slug,
          songIds: props.songIds,
          userId,
          inLibrary: true,
        }
      : libraryResourceType === "playlists" && props.isUserPlaylist
        ? {
            kind: "collection" as const,
            resourceId: props.resourceId,
            resourceType: "playlists" as const,
            sourceOrigin: "user-playlist" as const,
            isUserPlaylist: true as const,
            title: props.title,
            subtitle: props.subtitle,
            artworkUrl: props.imageUrl,
            href: props.slug,
            songIds: props.songIds,
            userId,
            inLibrary: false,
          }
        : props.resourceType === "albums"
          ? {
              kind: "collection" as const,
              resourceId: props.resourceId,
              resourceType: "albums" as const,
              sourceOrigin: "catalog" as const,
              isUserPlaylist: false as const,
              title: props.title,
              subtitle: props.subtitle,
              artworkUrl: props.imageUrl,
              href: props.slug,
              songIds: props.songIds,
              userId,
              isLibraryView: props.slug?.startsWith("/library/albums/") ?? false,
              inLibrary: false,
            }
          : props.resourceType === "playlists"
            ? {
                kind: "collection" as const,
                resourceId: props.resourceId,
                resourceType: "playlists" as const,
                sourceOrigin: "catalog" as const,
                isUserPlaylist: false as const,
                title: props.title,
                subtitle: props.subtitle,
                artworkUrl: props.imageUrl,
                href: props.slug,
                songIds: props.songIds,
                userId,
                inLibrary: false,
              }
            : undefined;

  return (
    <MediaCardShell
      id={cardId}
      artworkColor={props.artworkColors.main}
      href={props.slug}
      onOpen={props.onOpen}
    >
      <>
        <div className="media-card-artwork rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageSrcSet={props.imageSrcSet}
            aspectRatio={props.artworkAspectRatio}
            artworkColors={props.artworkColors}
            containerClassName="w-full [--override-placeholder-bg-color:var(--artwork-bg-color)] [anchor-name:--shelf-first-artwork]"
          />

          <div className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]">
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

            {(props.menuContext || collectionMenuContext || props.menuItems) && (
              <CardContextMenu
                id={cardId}
                context={props.menuContext ?? collectionMenuContext}
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
            (props.resourceType === "music-videos" &&
              isMusicVideoFavorite)
          }
        />
      </>
    </MediaCardShell>
  );
}
