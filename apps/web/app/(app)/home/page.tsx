"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MediaShelf from "@/components/media/media-shelf";
import {
  ShelfDetailLayout,
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
import { RequestErrorState } from "@/components/states/request-error-state";
import { useShelfDetailHistory } from "@/hooks/use-shelf-detail-history";

const FEATURED_ARTISTS_SHELF_ID = "global-top-artists";
const STATIONS_FOR_YOU_SHELF_ID = "user-stations-for-you";

export default function HomePage() {
  const { data, loading, error, refresh, retry } = useHomeRecommendations();
  const { shelf: recentlyPlayedShelf, loading: recentlyPlayedLoading } =
    useRecentlyPlayedSection();
  const showHomeLoading = useMinimumLoadingDuration(
    loading || recentlyPlayedLoading,
  );
  const [selectedShelfDetail, setSelectedShelfDetail] =
    useState<HomeShelf | null>(null);
  const selectedShelfId = selectedShelfDetail?.id ?? null;
  const [loadedShelves, setLoadedShelves] = useState<Record<string, HomeShelf>>(
    {},
  );
  const [loadingShelfId, setLoadingShelfId] = useState<string | null>(null);
  const [shelfLoadError, setShelfLoadError] = useState<string | null>(null);
  const showShelfDetailLoading = useMinimumLoadingDuration(
    Boolean(selectedShelfId && loadingShelfId === selectedShelfId),
  );
  const {
    open: openShelf,
    close: closeShelf,
    isCurrent: isCurrentShelf,
    invalidate: invalidateShelf,
    update: updateShelf,
  } = useShelfDetailHistory({
    owner: "home-shelf",
    selected: selectedShelfDetail,
    setSelected: setSelectedShelfDetail,
    getKey: (shelf) => shelf.id,
    restoreScroll: true,
    scrollReady:
      !showHomeLoading && (!selectedShelfId || !showShelfDetailLoading),
  });

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

    void ensureArtistStationArtworkBatch(artistStationIds)
      .then((updated) => {
        if (!active || !updated) return;
        // The renderer persisted the composite cover. Refresh once for the
        // complete batch so every card changes together without a page reload.
        void refresh(false, undefined, true);
      })
      .catch(() => undefined);

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

      setShelfLoadError(null);
      if (loadedShelves[shelfId]) {
        openShelf(loadedShelves[shelfId]);
        return;
      }
      if (loadingShelfId === shelfId) {
        openShelf(localShelf);
        return;
      }

      try {
        openShelf(localShelf);
        setLoadingShelfId(shelfId);
        const response = await getRecommendationSection(shelfId);
        const fullShelf = mapHomeRecommendations(response).find(
          (shelf) => shelf.id === shelfId,
        );
        if (!fullShelf) throw new Error("Recommendation section is empty");

        setLoadedShelves((current) => ({ ...current, [shelfId]: fullShelf }));
        updateShelf(shelfId, () => fullShelf);
      } catch {
        invalidateShelf(shelfId);
        if (!isCurrentShelf(shelfId)) return;
        closeShelf();
        setShelfLoadError("Không thể tải đầy đủ nội dung của kệ này.");
      } finally {
        setLoadingShelfId((current) => (current === shelfId ? null : current));
      }
    },
    [
      closeShelf,
      isCurrentShelf,
      invalidateShelf,
      loadedShelves,
      loadingShelfId,
      openShelf,
      shelvesWithRecentlyPlayed,
      updateShelf,
    ],
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

  const selectedShelfWithOverlay =
    selectedShelfDetail?.id === RECENTLY_PLAYED_SHELF_ID
      ? (recentlyPlayedShelf ?? selectedShelfDetail)
      : selectedShelfDetail;

  return (
    <ShelfDetailLayout
      detail={
        selectedShelfId &&
        (showShelfDetailLoading ? (
          <ShelfDetailLoading />
        ) : selectedShelfWithOverlay ? (
          <ShelfDetailView
            shelf={selectedShelfWithOverlay}
            onBack={() => {
              closeShelf();
              setLoadingShelfId(null);
            }}
          />
        ) : null)
      }
    >
      {!error && (
        <>
          <div
            data-app-scroll-ready={!showHomeLoading}
            className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8"
          >
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

      {error && <RequestErrorState onRetry={() => void retry()} />}
      {shelfLoadError && (
        <p className="mx-(--bodyGutter) text-red-500">{shelfLoadError}</p>
      )}

      {!showHomeLoading &&
        !error &&
        homeShelves.map((shelf, index) => {
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
        })}
    </ShelfDetailLayout>
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
