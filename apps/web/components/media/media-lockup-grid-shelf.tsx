"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import CardArtwork from "@/components/media/common/card-artwork";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { PlaybackWaveform } from "@/components/songs/playback-waveform";
import { getMediaCardMenuContext } from "@/lib/context-menu/media-card-menu-context";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
import { playbackIntentProps } from "@/lib/player/playback-intent";
import { usePlayerStore } from "@/lib/player/use-player-store";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import PauseIcon from "../icons/pause-icon";
import PlayIcon from "../icons/play-icon";

type MediaLockupGridShelfProps = {
  title: string;
  items: MediaCardProps[];
  onTitleClick?: () => void;
  onBack?: () => void;
  isDetail?: boolean;
  endAction?: ReactNode;
  listClassName?: string;
  lockupWrapperClassName?: string;
  sectionClassName?: string;
};

function ShelfTitle({
  title,
  onTitleClick,
  onBack,
}: Pick<MediaLockupGridShelfProps, "title" | "onTitleClick" | "onBack">) {
  const onClick = onBack ?? onTitleClick;
  const isBackAction = Boolean(onBack);
  const content = (
    <>
      {isBackAction && <ShelfTitleChevron back />}
      <span dir="auto" className={isBackAction ? "ml-1" : undefined}>
        {title}
      </span>
      {!isBackAction && onClick && <ShelfTitleChevron />}
    </>
  );

  if (!onClick) return content;

  return (
    <button
      className="text-start appearance-none"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function ShelfTitleChevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      className={`h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon)) inline-block align-baseline ${back ? "rotate-180" : "ml-1"}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z" />
    </svg>
  );
}

function mediaKindLabel(card: MediaCardProps) {
  switch (card.resourceType) {
    case "songs":
      return "Song";
    case "albums":
      return "Album";
    case "artists":
      return "Artist";
    case "playlists":
      return "Playlist";
    case "music-videos":
      return "Music Video";
    default:
      return "";
  }
}

function subtitle(card: MediaCardProps) {
  const kind = mediaKindLabel(card);
  if (card.resourceType === "artists" || !card.subtitle) return kind;
  return kind ? `${kind} · ${card.subtitle}` : card.subtitle;
}

function CardOpenAction({ card }: { card: MediaCardProps }) {
  const className = "click-action";
  const ariaLabel = card.altText ?? card.title;

  if (card.slug) {
    return (
      <Link
        aria-label={ariaLabel}
        className={className}
        href={card.slug}
        onClick={card.onOpen}
      />
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={card.onOpen}
      type="button"
    />
  );
}

type TopResultPlayButtonProps = {
  card: MediaCardProps;
  isCurrentSong: boolean;
  isPlaying: boolean;
  onTogglePlayback: () => void;
};

function TopResultPlayButton({
  card,
  isCurrentSong,
  isPlaying,
  onTogglePlayback,
}: TopResultPlayButtonProps) {
  const isDirectlyPlayable =
    card.resourceType === "songs" || card.resourceType === "music-videos";
  const canPlay = isDirectlyPlayable
    ? Boolean(card.onPlay)
    : card.resourceType === "albums" || card.resourceType === "playlists";

  const play = () => {
    if (isCurrentSong) {
      onTogglePlayback();
      return;
    }
    if (isDirectlyPlayable) {
      card.onPlay?.();
      return;
    }
    void playCatalogResource(card.resourceType, card.resourceId);
  };

  return (
    <button
      type="button"
      className="play-button play-button--standard group relative"
      disabled={!canPlay}
      {...playbackIntentProps({
        id: card.resourceId,
        playbackUrl:
          card.resourceType === "songs" ? `mse:${card.resourceId}` : undefined,
      })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        play();
      }}
    >
      {isCurrentSong ? (
        <>
          <PlaybackWaveform isPlaying={isPlaying} seed={card.resourceId} />
          <span className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100">
            {isPlaying ? (
              <PauseIcon className="icon" />
            ) : (
              <PlayIcon className="icon play-svg" />
            )}
          </span>
        </>
      ) : (
        <PlayIcon className="icon play-svg" />
      )}
    </button>
  );
}

export default function MediaLockupGridShelf({
  title,
  items,
  onTitleClick,
  onBack,
  isDetail = false,
  endAction,
  listClassName,
  lockupWrapperClassName,
  sectionClassName,
}: MediaLockupGridShelfProps) {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);

  if (!items.length) return null;

  return (
    <>
      <div
        className={`min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) ${isDetail ? "pt-8" : "pt-3"} ${sectionClassName ?? ""}`}
      >
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="flex items-center justify-end m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
                <ShelfTitle
                  onBack={onBack}
                  onTitleClick={onTitleClick}
                  title={title}
                />
              </h2>
            </div>
            {endAction}
          </div>

          <ul
            className={
              listClassName ??
              "grid gap-2.5 m-[0_var(--bodyGutter)_32px] min-[1000px]:gap-5 min-[1000px]:grid-cols-[repeat(3,1fr)] min-[687px]:max-[999px]:grid-cols-[1fr]"
            }
          >
            {items.map((card) => {
              const menuContext = getMediaCardMenuContext(card);
              const isCurrentSong =
                card.resourceType === "songs" &&
                currentSong?.id === card.resourceId;
              const isPlayingCard = isCurrentSong && playing;
              const isPausedCard = isCurrentSong && !playing;

              return (
                <li
                  className="grid-item"
                  key={`${card.resourceType}-${card.id}`}
                >
                  <div
                    className={`top-search-lockup-wrapper group ${lockupWrapperClassName ?? ""} ${isPlayingCard ? "is-playing" : isPausedCard ? "is-paused" : ""}`}
                  >
                    <div
                      className={`top-search-lockup ${card.resourceType === "artists" ? "top-search-lockup--ellipse" : ""}`}
                      aria-label={card.altText ?? card.title}
                    >
                      <div className="top-search-lockup__action">
                        <CardOpenAction card={card} />
                      </div>

                      <div className="top-search-lockup__content">
                        <div className="top-search-lockup__artwork">
                          <CardArtwork
                            altText={card.altText ?? card.title}
                            aspectRatio={card.artworkAspectRatio}
                            artworkColors={card.artworkColors}
                            imageSrcSet={card.imageSrcSet}
                            sizes="110px"
                            title={card.title}
                            variant="cover"
                          />

                          {!(card.resourceType === "artists") && (
                            <div className="top-search-lockup__play-button-wrapper">
                              <div className="interactive-play-button">
                                <TopResultPlayButton
                                  card={card}
                                  isCurrentSong={isCurrentSong}
                                  isPlaying={isPlayingCard}
                                  onTogglePlayback={togglePlayback}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="top-search-lockup__description">
                          <ul>
                            <li className="top-search-lockup__primary">
                              <span className="top-search-lockup__primary__title">
                                {card.title}
                              </span>
                            </li>
                            <li className="top-search-lockup__secondary">
                              {subtitle(card)}
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className="top-search-lockup__icons">
                        <div className="cloud-buttons [--contextMenuEllipsisFillOverride:var(--systemSecondary)] hover:[--contextMenuEllipsisFillOverride:#000] dark:hover:[--contextMenuEllipsisFillOverride:#fff]">
                          {menuContext && (
                            <AmpContextMenuButton
                              context={menuContext}
                              id={`search-${card.resourceType}-${card.resourceId}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
