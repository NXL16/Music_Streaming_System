"use client";

import Link from "next/link";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { useCatalogSong } from "@/lib/catalog/use-catalog-song";
import { formatReleaseDate } from "@/lib/format/release-date";
import { ArtistLinks } from "../media/artist-links";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { AddToLibraryButton } from "../songs/add-to-library-button";
import type { PlayerSongCredit } from "@/lib/player/use-player-store";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";
import {
  SONG_CREDIT_ROLE_BY_ID,
  SONG_CREDIT_SECTIONS,
  type SongCreditSection,
} from "@musical/shared-constants";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import CardArtwork from "../media/common/card-artwork";
import { CSSProperties, useCallback, useState } from "react";
import { AlbumRelatedShelves } from "./album-related-shelves";
import type { MediaCardProps } from "../media/media-card.types";
import {
  ShelfDetailLoading,
  ShelfDetailView,
} from "../media/shelf-detail-view";
import { getCatalogAlbumRelated } from "@/lib/catalog/catalog.api";
import {
  catalogAlbumReleaseYearCardOptions,
  mapCatalogAlbums,
} from "@/lib/catalog/search.mapper";
import { useAlbumRelatedShelfState } from "@/lib/catalog/use-album-related-shelf-state";
import { CatalogMusicVideosShelf } from "../music-videos/catalog-music-videos-shelf";
import { FavoriteSongButton } from "../songs/favorite-song-button";

type SongDetailPageProps = {
  releaseTrackId: string;
};

const MORE_BY_SHELF_SECTIONS = ["more-by"] as const;

function creditSections(credits: PlayerSongCredit[] = []) {
  const grouped = new Map<
    SongCreditSection,
    Map<string, { artist: PlayerSongCredit; roles: string[] }>
  >();
  for (const credit of credits) {
    const detail = SONG_CREDIT_ROLE_BY_ID.get(credit.role);
    if (!detail) continue;
    const people =
      grouped.get(detail.section) ??
      new Map<
        string,
        {
          artist: PlayerSongCredit;
          roles: string[];
        }
      >();
    const key = credit.id || credit.name;
    const person = people.get(key) ?? { artist: credit, roles: [] };
    // `artist` is an internal catalog ownership credit. Do not show its
    // generic Performer label when the contributor has a detailed role.
    if (
      detail.label !== "Performer" ||
      !person.roles.some((role) => role !== "Performer")
    ) {
      if (!person.roles.includes(detail.label)) person.roles.push(detail.label);
    }
    if (detail.label !== "Performer") {
      const genericIndex = person.roles.indexOf("Performer");
      if (genericIndex >= 0) person.roles.splice(genericIndex, 1);
    }
    people.set(key, person);
    grouped.set(detail.section, people);
  }
  return SONG_CREDIT_SECTIONS.flatMap((title) => {
    const people = grouped.get(title);
    return people?.size ? [{ title, people: [...people.values()] }] : [];
  });
}

function artistInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase() || "?";
}

export function SongDetailPage({ releaseTrackId }: SongDetailPageProps) {
  const { song, loading, error, reload } = useCatalogSong(releaseTrackId);
  const showLoading = useMinimumLoadingDuration(loading);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentAlbumId = song?.albumId ?? "";
  const relatedShelfKey = song ? `${currentAlbumId}:${song.id}` : "";
  const {
    initialData: relatedShelvesInitialData,
    showSpacer: showRelatedShelfSpacer,
    onAvailabilityChange: handleRelatedShelvesAvailability,
    onLoadingChange: handleRelatedShelvesLoading,
    onDataLoaded: handleRelatedShelvesData,
  } = useAlbumRelatedShelfState(relatedShelfKey);
  const [selectedRelatedShelf, setSelectedRelatedShelf] = useState<{
    albumId: string;
    sourceSongId: string;
    title: string;
    section: string;
    items: MediaCardProps[] | null;
    nextCursor: string;
    loadingMore: boolean;
  } | null>(null);
  const loadMoreRelatedShelf = useCallback(async () => {
    if (
      !selectedRelatedShelf?.items ||
      !selectedRelatedShelf.nextCursor ||
      selectedRelatedShelf.loadingMore
    ) {
      return;
    }

    const { albumId, sourceSongId, section, nextCursor } = selectedRelatedShelf;
    setSelectedRelatedShelf((current) =>
      current ? { ...current, loadingMore: true } : current,
    );
    try {
      const response = await getCatalogAlbumRelated(albumId, {
        section,
        cursor: nextCursor,
        limit: 30,
        sourceSongId,
      });
      const newItems = mapCatalogAlbums(
        response.moreBy,
        catalogAlbumReleaseYearCardOptions,
      );
      setSelectedRelatedShelf((current) => {
        if (
          !current ||
          !current.items ||
          current.albumId !== albumId ||
          current.section !== section ||
          current.nextCursor !== nextCursor
        ) {
          return current;
        }
        const existingIds = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [
            ...current.items,
            ...newItems.filter((item) => !existingIds.has(item.id)),
          ],
          nextCursor: response.nextCursor,
          loadingMore: false,
        };
      });
    } catch {
      setSelectedRelatedShelf((current) =>
        current?.section === section
          ? { ...current, loadingMore: false }
          : current,
      );
    }
  }, [selectedRelatedShelf]);

  if (showLoading) {
    return <CatalogPageLoading />;
  }

  if (error) {
    return (
      <div className="mx-(--bodyGutter) pt-8">
        <p className="text-red-500">{error}</p>
        <button
          className="mt-3 hover:underline"
          onClick={() => void reload()}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!song) {
    return (
      <p className="mx-(--bodyGutter) pt-8 text-(--systemSecondary)">
        Không tìm thấy bài hát.
      </p>
    );
  }

  const songCredits = song.credits ?? [];
  const sections = creditSections(songCredits);

  const headerArtists = projectLinkedArtists(
    songCredits
      // Contributor rows deliberately have no catalog Artist ID. They can be
      // credited as a performer, but must never change the song's main artist
      // header or become a navigable artist link.
      .filter(
        (credit): credit is PlayerSongCredit & { id: string } =>
          credit.role === "artist" &&
          credit.isPrimary === true &&
          Boolean(credit.id),
      )
      .sort((left, right) => left.position - right.position)
      .map(({ id, name, url }) => ({
        id,
        name,
        url,
      })),
  );
  const title = song.title;
  const artworkUrl = song.artworkUrl;
  const artworkProps =
    artworkUrl || song.artworkSrcSet
      ? {
          title,
          altText: title,
          imageSrcSet: song.artworkSrcSet ?? artworkUrl,
          artworkColors: {
            bg: song.artworkBgColor ?? "#2c2c2e",
            main: song.artworkBgColor ?? "#2c2c2e",
          },
        }
      : null;
  const headerIsExplicit = song.contentRating === "explicit";
  const releaseDate = formatReleaseDate(song.releaseDate, "long");
  const detailLine =
    song.album || releaseDate ? (
      <>
        {song.albumUrl ? (
          <Link className="hover:underline" href={song.albumUrl}>
            {song.album}
          </Link>
        ) : (
          song.album
        )}
        {song.album && releaseDate && <span> · </span>}
        {releaseDate}
      </>
    ) : null;
  if (selectedRelatedShelf) {
    if (!selectedRelatedShelf.items) return <ShelfDetailLoading />;

    return (
      <ShelfDetailView
        shelf={{
          title: selectedRelatedShelf.title,
          items: selectedRelatedShelf.items,
        }}
        onBack={() => setSelectedRelatedShelf(null)}
        hasMore={Boolean(selectedRelatedShelf.nextCursor)}
        loadingMore={selectedRelatedShelf.loadingMore}
        onLoadMore={loadMoreRelatedShelf}
      />
    );
  }

  return (
    <>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) in-[.has-theme-override]:[--header-title-chevron-color:var(--systemSecondary)]">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="[view-timeline-name:--header-view] [view-timeline-axis:block] after:content-[''] after:bg-(--joe-color) after:block after:inset-0 after:absolute after:z-[calc(var(--z-default)-2)] min-[484px]:after:-inset-s-(--web-navigation-width)">
            <div
              className={`grid [grid-template-areas:var(--containerDetailHeaderGridAreas,'secondary-actions'_'artwork'_'headings'_'primary-actions'_'description')] [justify-items:var(--containerDetailHeaderAlign,center)] mx-(--bodyGutter) mb-(--containerDetailHeaderSpacer,32px) pt-3.75 min-[1000px]:grid-cols-[auto_1fr_auto] min-[1000px]:justify-items-start min-[1000px]:mb-(--containerDetailHeaderSpacer,46px) min-[1000px]:pt-2 min-[1000px]:[grid-template-areas:'secondary-actions_secondary-actions_secondary-actions'_'artwork_headings_headings'_'artwork_headings_headings'_'artwork_primary-actions_primary-actions'] min-[1000px]:grid-rows-[auto_1fr_1fr_36px]`}
            >
              <div
                slot="artwork"
                className="[--artworkSize:270px] [--radiosity-effect-shadow-z:var(--z-gpu)] [align-self:start] rounded-(--global-border-radius-large,10px) [box-shadow:0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] relative w-[min(var(--artworkSize),calc(100vw-var(--bodyGutter)-var(--bodyGutter)))] z-(--radiosity-effect-shadow-z,var(--z-default)) min-[484px]:w-(--artworkSize) min-[1000px]:mt-0 min-[1000px]:me-8.5 max-[999px]:m-[15px_auto_0] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:animate-[artwork-scroll-effects_linear] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:[animation-timeline:--header-view] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:[animation-range:exit]"
                style={
                  {
                    "--contrast-gradient-opacity": "0",
                    "--shadow-opacity": "0",
                    "--base-border-opacity": "0",
                    "--base-border-color": "0, 0, 0",
                    "--refraction-border-opacity": "0",
                    "--sheen-overlay-opacity": "0",
                    "--pointer-pitch": "0.0000",
                    "--pointer-roll": "0.0000",
                    "--pointer-light-angle": "0",
                    "--pointer-active": "0",
                  } as CSSProperties
                }
              >
                {artworkProps && (
                  <>
                    <div className="[--artwork-override-max-height:100%] filter-[blur(20px)_saturate(2)] size-full opacity-40 absolute transform-[scale(.88)] origin-[bottom_center] z-(--radiosity-effect-z,var(--z-default)) dark:opacity-30">
                      <CardArtwork variant="cover" {...artworkProps} />
                    </div>

                    <div className="[background:radial-gradient(circle_at_center,#fff_0,hsla(0,0%,100%,0)_70%)] rounded-[50%] inset-[-20%] opacity-(--contrast-gradient-opacity,0) pointer-events-none absolute z-0"></div>

                    <div className="relative z-1 rounded-(--global-border-radius-large,10px) [box-shadow:calc(var(--pointer-roll,0)*8px)_calc(var(--pointer-pitch,0)*8px+3px)_10px_rgba(0,0,0,var(--shadow-opacity,0))] overflow-hidden">
                      <CardArtwork variant="cover" {...artworkProps} />

                      <div className="[background:conic-gradient(from_calc(var(--pointer-light-angle,0)*1deg)_at_50%_50%,hsla(0,0%,100%,.6)_0deg,hsla(0,0%,100%,.15)_72deg,hsla(0,0%,100%,.05)_180deg,hsla(0,0%,100%,.15)_288deg,hsla(0,0%,100%,.6)_1turn)] rounded-[inherit] inset-0 [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] mask-exclude mix-blend-plus-lighter opacity-(--refraction-border-opacity,0) p-px pointer-events-none absolute z-3"></div>

                      <div className="[--sheen-x:calc(50%+var(--pointer-roll,0)*50%)] [--sheen-y:calc(50%+var(--pointer-pitch,0)*50%)] [background:radial-gradient(ellipse_100%_100%_at_var(--sheen-x)_var(--sheen-y),hsla(0,0%,100%,.6)_0,hsla(0,0%,100%,.3)_20%,hsla(0,0%,100%,0)_50%)] rounded-[inherit] inset-0 mix-blend-plus-lighter opacity-(--sheen-overlay-opacity,0) pointer-events-none absolute z-4"></div>
                    </div>
                  </>
                )}
              </div>

              <div className="[align-items:var(--containerDetailHeaderAlign,center)] flex flex-col [grid-area:headings] mt-4.5 min-w-0 relative w-full self-center min-[1000px]:items-start min-[1000px]:self-center min-[1000px]:-my-1.25 min-[1000px]:py-1.25 max-[483px]:[--systemPrimary:var(--systemPrimary-onDark)] max-[483px]:[--systemSecondary:var(--systemSecondary-vibrantOnDark)] max-[483px]:[--systemTertiary:var(--systemTertiary-onDark)] max-[483px]:[--systemQuaternary:var(--systemQuaternary-onDark)] max-[483px]:[--systemQuinary:var(--systemQuinary-onDark)] max-[483px]:[--keyColor:var(--systemPrimary-onDark)] max-[483px]:[--button-pill-color:#000] max-[483px]:[--button-pill-background-color:#fff] max-[483px]:[--iconEllipsisFill:var(--systemPrimary-onDark)] max-[483px]:[--button-action-background-color:#fff] max-[483px]:[--button-action-color:#000] max-[483px]:[--explicitFillOverride:var(--systemSecondary-vibrantOnDark)] max-[483px]:[--favoriteBadgeColor:var(--systemSecondary-vibrantOnDark)] max-[483px]:mix-blend-plus-lighter">
                <div className="empty:hidden text-(--systemSecondary) [font:var(--subhead-emphasized)] mt-2.25"></div>
                <h1 className="text-(--systemPrimary) cursor-text [font:var(--large-title-emphasized-short)] mb-[0.5px] wrap-break-word [text-align:var(--containerDetailHeaderAlign,center)] text-balance select-text line-clamp-2 min-[1000px]:[text-align:unset] max-[999px]:[font:var(--title-1-emphasized)] max-[999px]:mb-1">
                  <span dir="auto">{title}</span>
                  {headerIsExplicit && (
                    <span className="inline-flex items-center gap-1 ms-1 [--explicitBadgeSize:19px] [--favoriteBadgeSize:14px] [--favoriteBadgeMarginInlineStart:1px] has-[.explicit-wrapper]:ms-[6.5px] max-[999px]:[--explicitBadgeSize:16px]">
                      <span className="explicit-wrapper relative top-[0.7px]">
                        <span>
                          <ExplicitBadgeIcon />
                        </span>
                      </span>
                    </span>
                  )}
                </h1>

                {(headerArtists.length > 0 ||
                  song.songArtistName ||
                  song.artist) && (
                  <div className="[--linkColor:var(--keyColor)] text-(--keyColor) [font:var(--large-title-short)] -m-1.25 overflow-hidden p-1.25 [text-align:var(--containerDetailHeaderAlign,center)] text-ellipsis whitespace-nowrap w-full min-[1000px]:[text-align:unset] max-[999px]:[font:var(--title-1)] max-[999px]:text-[20px]!">
                    <ArtistLinks
                      artists={headerArtists}
                      fallbackText={song.songArtistName ?? song.artist}
                    />
                  </div>
                )}

                {detailLine && (
                  <div className="text-(--systemSecondary) [font:var(--callout-emphasized)] mt-1 text-center">
                    {detailLine}
                  </div>
                )}
              </div>

              <div className="[--addToLibraryMarginEnd:0] grid [grid-template-areas:'primary-start_primary-center_primary-end'] grid-cols-[1fr_auto_1fr] mt-3.5 gap-3 [grid-area:primary-actions] pointer-coarse:gap-3.5 min-[1000px]:self-end min-[1000px]:justify-start min-[1000px]:mt-0">
                <div className="order-2 relative">
                  <div className="w-full">
                    <button
                      type="button"
                      disabled={!song.playbackUrl}
                      onClick={() => setQueue([song])}
                      className="[--button-action-min-width:130px] [--button-action-height:36px] bg-(--button-pill-background-color,#000) rounded-(--button-action-border-radius,24px) text-(--button-pill-color,#fff) [font:var(--title-3-semibold)] px-3 items-center flex h-(--button-action-height,36px) justify-center min-w-(--button-action-min-width-override,var(--button-action-min-width,none)) disabled:opacity-50 pointer-coarse:[--button-action-height:48px] pointer-coarse:[--button-action-min-width:160px] pointer-coarse:[font:var(--title-2-semibold)]"
                    >
                      <span className="block">
                        <svg
                          className="pointer-coarse:[--button-action-icon-height:17px] [--button-action-icon-height:15px] [--button-action-icon-top-offset:0] w-[inherit] block text-current pointer-events-none shrink-0 h-(--button-action-icon-height,12px) relative top-(--button-action-icon-top-offset,1px) right-(--button-action-icon-inline-end,5px)"
                          height="16"
                          width="16"
                          viewBox="0 0 16 16"
                        >
                          <path d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"></path>
                        </svg>
                      </span>
                      <span className="contents">Play</span>
                    </button>
                  </div>
                </div>

                <div className="order-1 [--favoriteButtonStarOutline:var(--systemPrimary)]">
                  <div className="w-full">
                    <FavoriteSongButton
                      songId={song.id}
                      sourceAlbumId={song.albumId}
                      ariaLabel="Toggle favourite"
                      title="Favourite"
                      className="aria-pressed:[--favoriteIconSize:20px] aria-pressed:bg-(--systemPrimary)! [&_svg]:-translate-y-px bg-(--add-to-library-bg-color)! [--favoriteButtonSize:36px] [--favoriteIconStarOutline:var(--favoriteButtonStarOutline)] [--favoriteButtonStarFill:var(--background)] hover:[--favoriteIconStarOutline:var(--favoriteButtonStarOutline)]! aspect-square [border:.75px_solid_var(--button-circle-border-color,rgba(0,0,0,0.04))] rounded-[50%] [--favoriteIconSize:18px] pointer-coarse:[--favoriteButtonSize:48px] pointer-coarse:[--favoriteIconSize:22px] pointer-coarse:aria-pressed:[--favoriteIconSize:24px]"
                    />
                  </div>
                </div>

                <div className="order-3 [--addToLibraryFillOverride:var(--systemPrimary)]">
                  <div className="[--add-to-library-button-width:36px] [--add-to-library-icon-width:12px] pointer-coarse:[--add-to-library-button-width:48px] pointer-coarse:[--add-to-library-icon-width:16px]">
                    <AddToLibraryButton
                      resourceType="songs"
                      resourceId={song.id}
                      title={title}
                      subtitle={song.artist}
                      artworkUrl={artworkUrl}
                      sourceOrigin="catalog"
                      sourceAlbumId={song.albumId}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 [grid-area:secondary-actions] [justify-self:var(--containerDetailHeaderAlign,end)] relative min-[1000px]:[align-self:var(--containerDetailHeaderSecondaryActionsAlignSelf,end)]">
                <div className="flex gap-2 me-[calc(var(--bodyGutter)*-1+15px)] min-[484px]:me-[calc(var(--bodyGutter)*-1+8px)]">
                  <div className="cloud-buttons cloud-buttons--with-platter">
                    <div>
                      <button
                        className="items-center bg-(--share-button-bg-color,var(--systemQuinary)) rounded-full flex h-7 justify-center relative w-7 z-[calc(var(--z-default)+1)]"
                        aria-label="Share"
                      >
                        <svg
                          className="pointer-events-none text-(--share-button-icon-color,var(--keyColor)) h-(--share-button-icon-size,14px) -translate-y-px"
                          viewBox="0 0 89.425 112.844"
                        >
                          <path
                            d="M16.539 112.844h56.347c10.823 0 16.54-5.73 16.54-16.428V48.914c-.001-10.704-5.718-16.428-16.541-16.428H59.96v10.9h12.002c4.211 0 6.593 2.176 6.593 6.637v45.284c0 4.498-2.382 6.63-6.593 6.63h-54.5c-4.276 0-6.592-2.132-6.592-6.63V50.023c0-4.46 2.316-6.637 6.592-6.637h12.16v-10.9H16.54C5.752 32.486 0 38.194 0 48.914v47.502c0 10.714 5.752 16.428 16.539 16.428Z"
                            fill="var(--shareIconColor, currentColor)"
                          ></path>
                          <path
                            d="M44.694 73.414c2.786 0 5.035-2.284 5.035-4.944V20.026l-.429-7.239 2.803 3.685 6.442 6.848a4.545 4.545 0 0 0 3.301 1.445c2.39 0 4.436-1.753 4.436-4.222 0-1.321-.51-2.242-1.42-3.115L48.564 1.73C47.27.454 46.05 0 44.694 0c-1.32 0-2.547.454-3.87 1.73L24.518 17.428c-.872.872-1.383 1.794-1.383 3.115 0 2.469 2.002 4.222 4.4 4.222a4.6 4.6 0 0 0 3.329-1.445l6.451-6.848 2.809-3.692-.429 7.246v48.445c0 2.659 2.25 4.943 4.999 4.943Z"
                            fill="var(--shareIconColor, currentColor)"
                          ></path>
                        </svg>
                      </button>
                    </div>

                    <AmpContextMenuButton
                      id={`song-${song.releaseTrackId ?? song.id}`}
                      context={{
                        kind: "song",
                        songId: song.id,
                        releaseTrackId: song.releaseTrackId,
                        title,
                        subtitle: song.artist,
                        artworkUrl,
                        sourceAlbumId: song.albumId,
                        albumHref: song.albumUrl,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <div
          key={section.title}
          className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) in-[.has-theme-override]:[--header-title-chevron-color:var(--systemSecondary)]"
        >
          <>
            <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
              <section className="[--linkHoverTextDecoration:none] mx-(--bodyGutter) pb-9 min-[1000px]:[border-top:var(--keyline-border-style)] min-[1000px]:grid min-[1000px]:gap-(--song-detail-grid-gap,34px) min-[1000px]:grid-cols-[216px_3fr] min-[1000px]:pb-18 min-[1260px]:grid-cols-[296px_3fr]">
                <h2 className="text-(--systemSecondary) [font:var(--title-2-emphasized)] min-[1000px]:pt-3 max-[999px]:[border-bottom:var(--keyline-border-style)] max-[999px]:pb-3">
                  {section.title}
                </h2>

                <div className="">
                  <ul className="grid items-center gap-[0_34px] grid-cols-[1fr] m-0 min-[1000px]:grid-cols-[repeat(2,1fr)] min-[1260px]:grid-cols-[repeat(3,1fr)]">
                    {section.people.map(({ artist, roles }) => (
                      <li
                        key={artist.id || artist.name}
                        className="h-full relative z-(--z-default) max-[999px]:not-last:after:[border-bottom:var(--keyline-border-style)] max-[999px]:not-last:after:bottom-0 max-[999px]:not-last:after:content-[''] max-[999px]:not-last:after:block max-[999px]:not-last:after:inset-e-0 max-[999px]:not-last:after:absolute max-[999px]:not-last:after:w-[calc(100%-57px)] max-[999px]:not-last:after:z-(--z-default) min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:[border-bottom:var(--keyline-border-style)] min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:bottom-0 min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:content-[''] min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:block min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:inset-e-0 min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:absolute min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:w-[calc(100%-57px)] min-[1000px]:max-[1259px]:not-nth-last-[-n+2]:after:z-(--z-default) min-[1260px]:not-nth-last-[-n+3]:after:[border-bottom:var(--keyline-border-style)] min-[1260px]:not-nth-last-[-n+3]:after:bottom-0 min-[1260px]:not-nth-last-[-n+3]:after:content-[''] min-[1260px]:not-nth-last-[-n+3]:after:block min-[1260px]:not-nth-last-[-n+3]:after:inset-e-0 min-[1260px]:not-nth-last-[-n+3]:after:absolute min-[1260px]:not-nth-last-[-n+3]:after:w-[calc(100%-57px)] min-[1260px]:not-nth-last-[-n+3]:after:z-(--z-default)"
                      >
                        <div className="flex p-[15px_0]">
                          <div className="[--artwork-override-width:46px] [--artwork-override-height:46px] rounded-[50%] h-11.5 mr-2.5 min-w-11.5">
                            {artist.artworkUrl ? (
                              <CardArtwork
                                variant="cover"
                                title={artist.name}
                                altText={artist.name}
                                imageSrcSet={artist.artworkUrl}
                                artworkColors={{
                                  bg: "#2c2c2e",
                                  main: "#2c2c2e",
                                }}
                                sizes="46px"
                              />
                            ) : (
                              <div
                                aria-label={artist.name}
                                className="bg-(--systemQuaternary) flex h-full items-center justify-center rounded-[inherit] text-(--systemPrimary) [font:var(--title-3-emphasized)] w-full"
                              >
                                {artistInitial(artist.name)}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col justify-center">
                            <div className="[font:var(--body) mb-0.5">
                              {artist.name}
                            </div>

                            <div className="text-(--systemSecondary) [font:var(--callout)]">
                              {roles.join(", ")}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </>
        </div>
      ))}

      {showRelatedShelfSpacer && (
        <div className="-ms-(--web-navigation-width) ps-(--web-navigation-width) pt-3 [--songs-list-row-border-radius:12px] relative z-(--z-default) bg-(--opaqueShelfBG)">
          <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
            <div className="pt-4 w-full"></div>
          </div>
        </div>
      )}

      <CatalogMusicVideosShelf resourceType="songs" resourceId={song.id} />

      {song.albumId && (
        <AlbumRelatedShelves
          key={`${song.albumId}:${song.id}`}
          albumId={song.albumId}
          sourceSongId={song.id}
          moreByArtistName={song.songArtistName}
          initialData={relatedShelvesInitialData}
          sections={MORE_BY_SHELF_SECTIONS}
          onAvailabilityChange={handleRelatedShelvesAvailability}
          onLoadingChange={handleRelatedShelvesLoading}
          onDataLoaded={handleRelatedShelvesData}
          onOpenDetail={(shelf) =>
            setSelectedRelatedShelf({
              albumId: song.albumId!,
              sourceSongId: song.id,
              title: shelf.title,
              section: "more-by",
              items: null,
              nextCursor: "",
              loadingMore: false,
            })
          }
          onDetailLoaded={({ items, nextCursor }) =>
            setSelectedRelatedShelf((current) => {
              if (!current || current.albumId !== song.albumId) {
                return current;
              }
              return { ...current, items, nextCursor };
            })
          }
          onDetailLoadError={() => setSelectedRelatedShelf(null)}
        />
      )}
    </>
  );
}
