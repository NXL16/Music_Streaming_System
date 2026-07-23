"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import MediaShelf from "@/components/media/media-shelf";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { useHomeRecommendations } from "@/lib/recommendations/use-home-recommendations";
import {
  mapHomeRecommendations,
  type HomeShelf,
} from "@/lib/recommendations/recommendation.mapper";
import {
  getRecommendationSection,
  recordRecommendationInteraction,
} from "@/lib/recommendations/recommendation.api";
import MediaShelfSkeleton from "@/components/loading/loading";
import Loading from "@/app/loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { HOME_SHELF_PREVIEW_LIMIT } from "@musical/shared-constants";

const RECENTLY_PLAYED_SHELF_ID = "user-recently-played";
const DAILY_MIX_SHELF_ID = "user-daily-mix";
const STATIONS_FOR_YOU_SHELF_ID = "user-stations-for-you";
const FEATURED_ARTISTS_SHELF_ID = "global-top-artists";
const PERSONALIZED_HOME_ORDER = [
  "user-top-picks",
  "global-top-picks",
  RECENTLY_PLAYED_SHELF_ID,
  "user-more-like-1",
  "user-genre-1",
  DAILY_MIX_SHELF_ID,
  STATIONS_FOR_YOU_SHELF_ID,
  "user-find-your-mood",
  "user-new-releases",
  "user-more-like-2",
  "user-fans-like",
  "user-more-like-3",
  "user-genre-2",
] as const;

export default function HomePage() {
  const { data, loading, error, retry, recentlyPlayedItems } =
    useHomeRecommendations();
  const showHomeLoading = useMinimumLoadingDuration(loading);
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
  const shelvesWithRecentlyPlayed = useMemo(
    () =>
      orderPersonalizedHomeShelves(
        ensureRecentlyPlayedShelf(shelves, recentlyPlayedItems),
      ),
    [recentlyPlayedItems, shelves],
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
        const previewItems = previewShelfItems(shelf, recentlyPlayedItems);
        return {
          ...shelf,
          items: previewItems,
          hasMore:
            // The API may have overflow before Home removes duplicates shared
            // with earlier shelves. Only expose the detail chevron when this
            // shelf itself fills its 12-card Home preview.
            (shelf.hasMore &&
              previewItems.length >= HOME_SHELF_PREVIEW_LIMIT) ||
            (shelf.id === RECENTLY_PLAYED_SHELF_ID &&
              mergeShelfItems(recentlyPlayedItems, shelf.items).length >
                HOME_SHELF_PREVIEW_LIMIT),
        };
      }),
    [recentlyPlayedItems, shelvesWithRecentlyPlayed],
  );

  const selectedShelf = useMemo(
    () =>
      (selectedShelfId ? loadedShelves[selectedShelfId] : undefined) ??
      shelvesWithRecentlyPlayed.find((shelf) => shelf.id === selectedShelfId) ??
      null,
    [loadedShelves, selectedShelfId, shelvesWithRecentlyPlayed],
  );
  const selectedShelfWithOverlay = useMemo(
    () =>
      selectedShelf?.id === RECENTLY_PLAYED_SHELF_ID
        ? {
            ...selectedShelf,
            items: mergeShelfItems(recentlyPlayedItems, selectedShelf.items),
          }
        : selectedShelf,
    [recentlyPlayedItems, selectedShelf],
  );
  useLayoutEffect(() => {
    if (!selectedShelfId) return;

    document
      .querySelector<HTMLElement>("[data-app-scroll-container]")
      ?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedShelfId]);

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
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
        </>
      )}

      {error && (
        <div role="alert">
          <p className="mx-(--bodyGutter) text-red-500">{error}</p>
          <button onClick={() => void retry()} type="button">
            Thử lại
          </button>
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
  recentlyPlayedItems: ReturnType<
    typeof useHomeRecommendations
  >["recentlyPlayedItems"],
) {
  if (
    recentlyPlayedItems.length === 0 ||
    shelves.some((shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID)
  ) {
    return shelves;
  }

  const recentShelf = {
    id: RECENTLY_PLAYED_SHELF_ID,
    title: "Recently Played",
    displayKind: "MusicCoverShelf",
    sourceDisplayKind: "MusicCoverShelf",
    modelVersion: 1,
    hasMore: false,
    items: recentlyPlayedItems,
  } satisfies ReturnType<typeof mapHomeRecommendations>[number];

  const heroIndex = shelves.findIndex(
    (shelf) => shelf.displayKind === "MusicNotesHeroShelf",
  );

  if (heroIndex < 0) return [recentShelf, ...shelves];

  return [
    ...shelves.slice(0, heroIndex + 1),
    recentShelf,
    ...shelves.slice(heroIndex + 1),
  ];
}

function orderPersonalizedHomeShelves(
  shelves: ReturnType<typeof mapHomeRecommendations>,
) {
  const order = new Map<string, number>(
    PERSONALIZED_HOME_ORDER.map((id, index) => [id, index]),
  );
  const ordered = shelves
    .map((shelf, index) => ({ shelf, index }))
    .sort(
      (left, right) =>
        (order.get(left.shelf.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.shelf.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map(({ shelf }) => shelf);

  const recentlyPlayedIndex = ordered.findIndex(
    (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
  );
  const playlistIndex = ordered.findIndex(
    (shelf) => shelf.id === DAILY_MIX_SHELF_ID,
  );

  // The Home rhythm is intentional: two discovery shelves separate recent
  // listening from the made-for-you playlist. If a sparse taste profile could
  // not generate More Like or Genre, promote the next meaningful shelf rather
  // than letting Playlist Made for You jump directly below Recently Played.
  if (recentlyPlayedIndex < 0 || playlistIndex < 0) return ordered;

  const recentlyPlayed = ordered[recentlyPlayedIndex];
  const playlist = ordered[playlistIndex];
  const beforeRecentlyPlayed = ordered
    .slice(0, recentlyPlayedIndex)
    .filter((shelf) => shelf.id !== DAILY_MIX_SHELF_ID);
  const afterRecentlyPlayed = ordered
    .slice(recentlyPlayedIndex + 1)
    .filter((shelf) => shelf.id !== DAILY_MIX_SHELF_ID);
  // Stations and moods are listening destinations, not discovery bridges.
  // They must stay after Playlist Made for You even when More Like/Genre is
  // unavailable for a sparse profile.
  const bridgeCandidates = afterRecentlyPlayed.filter(
    (shelf) =>
      shelf.id !== STATIONS_FOR_YOU_SHELF_ID &&
      shelf.id !== "user-find-your-mood",
  );
  const bridgeShelves = bridgeCandidates.slice(0, 2);
  const bridgeIds = new Set(bridgeShelves.map((shelf) => shelf.id));
  const rest = afterRecentlyPlayed.filter((shelf) => !bridgeIds.has(shelf.id));

  return [
    ...beforeRecentlyPlayed,
    recentlyPlayed,
    ...bridgeShelves,
    playlist,
    ...rest,
  ];
}

function previewShelfItems(
  shelf: ReturnType<typeof mapHomeRecommendations>[number],
  recentlyPlayedItems: ReturnType<
    typeof useHomeRecommendations
  >["recentlyPlayedItems"],
) {
  const sourceItems =
    shelf.id === RECENTLY_PLAYED_SHELF_ID
      ? mergeShelfItems(recentlyPlayedItems, shelf.items)
      : shelf.items;

  return sourceItems.slice(0, HOME_SHELF_PREVIEW_LIMIT);
}

function mergeShelfItems<
  T extends { resourceId: string; resourceType: string },
>(leadingItems: T[], baseItems: T[]) {
  const seen = new Set<string>();

  return [...leadingItems, ...baseItems].filter((item) => {
    const key = `${item.resourceType}:${item.resourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type ShelfDetailViewProps = {
  shelf: ReturnType<typeof mapHomeRecommendations>[number];
  onBack: () => void;
};

function ShelfDetailLoading() {
  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8">
      <div className="flex min-h-[calc(100vh-16rem)] items-center justify-center">
        <Loading fullScreen={false} size={56} />
      </div>
    </div>
  );
}

function ShelfDetailView({ shelf, onBack }: ShelfDetailViewProps) {
  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
              <button
                onClick={() => onBack()}
                className="flex items-center gap-x-2 appearance-none"
              >
                <svg
                  className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon)) rotate-180"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                >
                  <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z"></path>
                </svg>
                <span dir="auto">{shelf.title}</span>
              </button>
            </h2>
          </div>
        </div>

        <ul className="mb-8 mx-(--bodyGutter) ps-0 pe-0 grid gap-(--roomGridGap) grid-cols-[repeat(var(--roomGridColumns),minmax(0,1fr))] [--roomGridColumns:2] [--roomGridGap:10px] min-[415px]:[--roomGridColumns:3] min-[1000px]:[--roomGridGap:20px] min-[1000px]:[--roomGridColumns:4] min-[1260px]:[--roomGridColumns:5] min-[1580px]:[--roomGridColumns:6]">
          {shelf.items.map((card) => (
            <MediaCardRenderer key={card.id} {...card} />
          ))}
        </ul>
      </div>
    </div>
  );
}
