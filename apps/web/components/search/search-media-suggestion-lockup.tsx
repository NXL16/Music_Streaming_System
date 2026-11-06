"use client";

import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import CardArtwork from "@/components/media/common/card-artwork";
import { getMediaCardMenuContext } from "@/lib/context-menu/media-card-menu-context";
import type { MediaCardProps } from "@/components/media/media-card.types";

function mediaSuggestionSubtitle(card: MediaCardProps) {
  const type =
    card.resourceType === "songs"
      ? "Song"
      : card.resourceType === "albums"
        ? "Album"
        : card.resourceType === "artists"
          ? "Artist"
          : card.resourceType === "music-videos"
            ? "Music Video"
            : card.resourceType;
  return card.resourceType === "artists" || !card.subtitle
    ? type
    : type + " \u00b7 " + card.subtitle;
}

export function SearchMediaSuggestionLockup({
  card,
  showMobileActions = false,
}: {
  card: MediaCardProps;
  showMobileActions?: boolean;
}) {
  const menuContext =
    card.resourceType === "artists"
      ? card.menuContext
      : getMediaCardMenuContext(card);

  return (
    <div className="top-search-list-lockup">
      <div className="top-search-list-lockup__content">
        <div
          className={`top-search-list-lockup__artwork ${card.resourceType === "artists" ? "top-search-list-lockup__artwork--circle" : ""}`}
        >
          <CardArtwork
            altText=""
            aspectRatio={card.artworkAspectRatio}
            artworkColors={card.artworkColors}
            containerClassName="[--artwork-override-width:calc(56px*var(--aspect-ratio))] [--artwork-override-height:56px] [--override-placeholder-bg-color:var(--artwork-bg-color)] min-[484px]:[--artwork-override-width:calc(46px*var(--aspect-ratio))] min-[484px]:[--artwork-override-height:46px]"
            imageSrcSet={card.imageSrcSet}
            sizes="40px"
            title={card.title}
            variant="cover"
          />
        </div>

        <ul className="top-search-list-lockup__description">
          <li className="top-search-list-lockup__explicit-wrapper">
            <span className="top-search-list-lockup__primary" dir="auto">
              {card.title}
            </span>
          </li>
          <li className="top-search-list-lockup__secondary" dir="auto">
            <span dir="auto">{mediaSuggestionSubtitle(card)}</span>
          </li>
        </ul>
      </div>

      <div className="top-search-list-lockup__icons">
        {showMobileActions && menuContext && (
          <span
            className="[--contextMenuEllipsisFillOverride:var(--systemSecondary)]"
            onClick={(event) => event.stopPropagation()}
          >
            <AmpContextMenuButton
              context={menuContext}
              id={`mobile-search-${card.resourceType}-${card.resourceId}`}
            />
          </span>
        )}

        {showMobileActions && card.resourceType === "artists" && (
          <svg
            width="36"
            height="64"
            strokeLinejoin="round"
            viewBox="0 0 36 64"
            className="top-search-list-lockup__icon"
            aria-hidden="true"
          >
            <path d="M3.344 64c.957 0 1.768-.368 2.394-.994l29.2-28.538c.701-.7 1.069-1.547 1.069-2.468 0-.957-.368-1.841-1.068-2.467L5.774 1.031C5.112.37 4.301.001 3.344.001 1.43 0-.006 1.472-.006 3.387c0 .884.367 1.767.956 2.393L27.758 32 .95 58.218a3.5 3.5 0 0 0-.956 2.395c0 1.914 1.435 3.387 3.35 3.387"></path>
          </svg>
        )}
      </div>
    </div>
  );
}
