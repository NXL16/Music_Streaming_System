"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MediaShelf from "@/components/media/media-shelf";
import {
  ShelfDetailLoading,
  ShelfDetailView,
} from "@/components/media/shelf-detail-view";
import { useHomeRecommendations } from "@/lib/recommendations/use-home-recommendations";
import {
  mapHomeRecommendations,
  type HomeShelf,
} from "@/lib/recommendations/recommendation.mapper";
import {
  getRecommendationSection,
  recordRecommendationInteraction,
} from "@/lib/recommendations/recommendation.api";
import { ensureArtistStationArtworkBatch } from "@/lib/recommendations/artist-station";
import MediaShelfSkeleton from "@/components/loading/media-shelf-skeleton";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { useRecentlyPlayedSection } from "@/lib/recommendations/use-recently-played-section";
import {
  normalizeRecentlyPlayedCard,
  RECENTLY_PLAYED_SHELF_ID,
} from "@/lib/recommendations/recently-played-presentation";
import {
  HERO_SHELF_PREVIEW_LIMIT,
  HOME_SHELF_PREVIEW_LIMIT,
} from "@musical/shared-constants";
import { useAppScrollToTop } from "@/lib/layout/use-app-scroll-to-top";

const FEATURED_ARTISTS_SHELF_ID = "global-top-artists";
const STATIONS_FOR_YOU_SHELF_ID = "user-stations-for-you";

export default function HomePage() {
  const { data, loading, error, refresh, retry } = useHomeRecommendations();
  const { shelf: recentlyPlayedShelf, loading: recentlyPlayedLoading } =
    useRecentlyPlayedSection();
  const showHomeLoading = useMinimumLoadingDuration(
    loading || recentlyPlayedLoading,
  );
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [loadedShelves, setLoadedShelves] = useState<Record<string, HomeShelf>>(
    {},
  );
  const [loadingShelfId, setLoadingShelfId] = useState<string | null>(null);
  const [shelfLoadError, setShelfLoadError] = useState<string | null>(null);
  const showShelfDetailLoading = useMinimumLoadingDuration(
    Boolean(loadingShelfId),
  );

  const shelves = useMemo(
    () =>
      data
        ? mapHomeRecommendations(data).filter(
            (shelf) => shelf.id !== FEATURED_ARTISTS_SHELF_ID,
          )
        : [],
    [data],
  );

  const artistStationIds = useMemo(() => {
    const references =
      data?.resources?.personalRecommendation[STATIONS_FOR_YOU_SHELF_ID]
        ?.relationships?.contents?.data ?? [];
    const stations = data?.resources?.stations;
    return [
      ...new Set(
        references
          .filter(
            (reference) =>
              reference.type === "stations" &&
              /^artist-station-[a-f0-9]{32}$/.test(reference.id) &&
              stations?.[reference.id]?.attributes?.stationArtworkReady !==
                true,
          )
          .map((reference) => reference.id),
      ),
    ];
  }, [data]);

  useEffect(() => {
    if (!artistStationIds.length) return;
    let active = true;

    void ensureArtistStationArtworkBatch(artistStationIds).then((updated) => {
      if (!active || !updated) return;
      // The renderer persisted the composite cover. Refresh once for the
      // complete batch so every card changes together without a page reload.
      void refresh(false, undefined, true);
    });

    return () => {
      active = false;
    };
  }, [artistStationIds, refresh]);

  const shelvesWithRecentlyPlayed = useMemo(
    () => ensureRecentlyPlayedShelf(shelves, recentlyPlayedShelf),
    [recentlyPlayedShelf, shelves],
  );

  const handleSelectShelf = useCallback(
    async (shelfId: string) => {
      const localShelf = shelvesWithRecentlyPlayed.find(
        (shelf) => shelf.id === shelfId,
      );
      if (!localShelf) return;

      if (loadedShelves[shelfId]) {
        setSelectedShelfId(shelfId);
        return;
      }

      try {
        setShelfLoadError(null);
        setSelectedShelfId(shelfId);
        setLoadingShelfId(shelfId);
        const response = await getRecommendationSection(shelfId);
        const fullShelf = mapHomeRecommendations(response).find(
          (shelf) => shelf.id === shelfId,
        );
        if (!fullShelf) throw new Error("Recommendation section is empty");

        setLoadedShelves((current) => ({ ...current, [shelfId]: fullShelf }));
      } catch {
        setSelectedShelfId(null);
        setShelfLoadError("Không thể tải đầy đủ nội dung của kệ này.");
      } finally {
        setLoadingShelfId((current) => (current === shelfId ? null : current));
      }
    },
    [loadedShelves, shelvesWithRecentlyPlayed],
  );

  const homeShelves = useMemo(
    () =>
      shelvesWithRecentlyPlayed.map((shelf) => {
        const previewItems = previewShelfItems(shelf);
        const isHeroShelf = shelf.displayKind === "MusicNotesHeroShelf";

        return {
          ...shelf,
          items: previewItems,
          hasMore: isHeroShelf
            ? false
            : (shelf.hasMore &&
                previewItems.length >= HOME_SHELF_PREVIEW_LIMIT) ||
              (shelf.id === RECENTLY_PLAYED_SHELF_ID &&
                shelf.items.length > HOME_SHELF_PREVIEW_LIMIT),
        };
      }),
    [shelvesWithRecentlyPlayed],
  );

  const selectedShelf = useMemo(
    () =>
      (selectedShelfId ? loadedShelves[selectedShelfId] : undefined) ??
      shelvesWithRecentlyPlayed.find((shelf) => shelf.id === selectedShelfId) ??
      null,
    [loadedShelves, selectedShelfId, shelvesWithRecentlyPlayed],
  );

  const selectedShelfWithOverlay = useMemo(() => {
    if (selectedShelf?.id !== RECENTLY_PLAYED_SHELF_ID) {
      return selectedShelf;
    }

    return recentlyPlayedShelf ?? selectedShelf;
  }, [recentlyPlayedShelf, selectedShelf]);

  useAppScrollToTop(selectedShelfId);

  return (
    <>
      {showShelfDetailLoading ? (
        <ShelfDetailLoading />
      ) : selectedShelfWithOverlay ? (
        <ShelfDetailView
          shelf={selectedShelfWithOverlay}
          onBack={() => {
            setSelectedShelfId(null);
            setLoadingShelfId(null);
          }}
        />
      ) : (
        <>
          <div className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8">
            <h1 className="text-(--systemPrimary) [font:var(--header-emphasized)] col-1 row-1">
              Home
            </h1>
          </div>
          <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-7"></div>
        </>
      )}

      {showHomeLoading && (
        <>
          <MediaShelfSkeleton displayKind="MusicNotesHeroShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" isMoreLike />
        </>
      )}

      {error && (
        <div className="mx-auto min-h-full w-full z-(--z-default)">
          <div
            role="alert"
            className="[--buttonTextColor:var(--systemSecondary)] [--buttonBorderColor:var(--systemSecondary)] items-center text-(--systemSecondary) flex flex-col gap-3 left-1/2 m-auto max-w-110 px-6.25 absolute text-center top-1/2 -translate-x-1/2 -translate-y-1/2 z-(--z-default)"
          >
            <h2 className="[font:var(--title-2)] mb-1.25">
              An error occurred.
            </h2>
            <div className="w-auto">
              <button
                type="button"
                onClick={() => void retry()}
                className="items-center bg-(--buttonBackgroundColor,var(--keyColorBG,var(--systemBlue))) rounded-(--buttonRadius,3px) [display:var(--buttonDisplay,flex)] [justify-content:var(--buttonJustifyContent,center)] [--buttonBackgroundColor:transparent] border border-solid border-(--buttonBorderColor,var(--keyColor,var(--systemBlue))) text-(--buttonTextColor,var(--keyColor)) [font:var(--body-tall)] min-w-(--buttonMinWidth,108px) pe-4 ps-4 min-[1260px]:h-(--buttonHeight,28px) min-[1260px]:w-(--buttonWidth,auto)"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
      {shelfLoadError && (
        <p className="mx-(--bodyGutter) text-red-500">{shelfLoadError}</p>
      )}

      {!showHomeLoading &&
        !error &&
        (selectedShelf
          ? null
          : homeShelves.map((shelf, index) => {
              return (
                <MediaShelf
                  key={shelf.id}
                  title={shelf.title}
                  displayKind={shelf.displayKind}
                  items={shelf.items}
                  normalizeItem={
                    shelf.id === RECENTLY_PLAYED_SHELF_ID
                      ? normalizeRecentlyPlayedCard
                      : undefined
                  }
                  prioritizeFirstCard={index === 0}
                  shelfId={shelf.id}
                  scrollToStartKey={
                    shelf.id === RECENTLY_PLAYED_SHELF_ID
                      ? shelf.items[0]?.id
                      : undefined
                  }
                  onSelect={shelf.hasMore ? handleSelectShelf : undefined}
                  onCardInteraction={(eventType, card, position) => {
                    void recordRecommendationInteraction({
                      sectionId: shelf.id,
                      resourceType: card.resourceType,
                      resourceId: card.resourceId,
                      position,
                      modelVersion: shelf.modelVersion,
                      eventType,
                    });
                  }}
                  headerArtwork={shelf.headerArtwork}
                  sourceAlbumHref={shelf.sourceAlbumHref}
                />
              );
            }))}
    </>
  );
}

function ensureRecentlyPlayedShelf(
  shelves: ReturnType<typeof mapHomeRecommendations>,
  recentlyPlayedShelf: HomeShelf | null,
) {
  const shelvesWithoutRecentlyPlayed = shelves.filter(
    (shelf) => shelf.id !== RECENTLY_PLAYED_SHELF_ID,
  );

  if (!recentlyPlayedShelf) return shelvesWithoutRecentlyPlayed;

  const heroIndex = shelvesWithoutRecentlyPlayed.findIndex(
    (shelf) => shelf.displayKind === "MusicNotesHeroShelf",
  );

  if (heroIndex < 0)
    return [recentlyPlayedShelf, ...shelvesWithoutRecentlyPlayed];

  return [
    ...shelvesWithoutRecentlyPlayed.slice(0, heroIndex + 1),
    recentlyPlayedShelf,
    ...shelvesWithoutRecentlyPlayed.slice(heroIndex + 1),
  ];
}

function previewShelfItems(
  shelf: ReturnType<typeof mapHomeRecommendations>[number],
) {
  return shelf.items.slice(
    0,
    shelf.displayKind === "MusicNotesHeroShelf"
      ? HERO_SHELF_PREVIEW_LIMIT
      : HOME_SHELF_PREVIEW_LIMIT,
  );
}
