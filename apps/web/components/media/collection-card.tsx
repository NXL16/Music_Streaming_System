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

type CollectionCardProps = MediaCardProps & {
  cardType: "collection";
};

export default function CollectionCard(props: CollectionCardProps) {
  const cardId = props.resourceId || props.id;
  const userId = useAuthStore((state) => state.user?.userId);
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
    <MediaCardShell id={cardId} artworkColor={props.artworkColors.main}>
      <>
        <div className="media-card-artwork rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageSrcSet={props.imageSrcSet}
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

            {collectionMenuContext && (
              <CardContextMenu id={cardId} context={collectionMenuContext} />
            )}
          </div>
        </div>

        <CollectionCardMetadata {...props} />
      </>
    </MediaCardShell>
  );
}
