"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import MediaShelf from "@/components/media/media-shelf";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { useHomeRecommendations } from "@/lib/recommendations/use-home-recommendations";
import {
  mapHomeRecommendations,
  type HomeShelf,
} from "@/lib/recommendations/recommendation.mapper";
import { getRecommendationSection } from "@/lib/recommendations/recommendation.api";
import MediaShelfSkeleton from "@/components/loading/loading";
import Loading from "@/app/loading";

const MAX_HOME_SHELF_ITEMS = 12;
const RECENTLY_PLAYED_SHELF_ID = "user-recently-played";
const DAILY_MIX_SHELF_ID = "user-daily-mix";
const STATIONS_FOR_YOU_SHELF_ID = "user-stations-for-you";
const FEATURED_ARTISTS_SHELF_ID = "global-top-artists";
const DAILY_MIX_SHELF_GAP = 2;
const HOME_SCROLL_IDLE_MS = 120;

function homePreviewDisplayKind(
  displayKind: ReturnType<typeof mapHomeRecommendations>[number]["displayKind"],
) {
  return displayKind === "MusicCoverGrid" ? "MusicCoverShelf" : displayKind;
}

export default function HomePage() {
  const { data, loading, error, recentlyPlayedItems } =
    useHomeRecommendations();
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [loadedShelves, setLoadedShelves] = useState<Record<string, HomeShelf>>(
    {},
  );
  const [loadingShelfId, setLoadingShelfId] = useState<string | null>(null);
  const [shelfLoadError, setShelfLoadError] = useState<string | null>(null);

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
      positionDailyMixShelf(
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

      // This shelf is produced from local listening events, not a persisted
      // recommendation section, so it is already available in memory.
      if (shelfId === RECENTLY_PLAYED_SHELF_ID || loadedShelves[shelfId]) {
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
        setLoadingShelfId((current) =>
          current === shelfId ? null : current,
        );
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
              previewItems.length >= MAX_HOME_SHELF_ITEMS) ||
            (shelf.id === RECENTLY_PLAYED_SHELF_ID &&
              mergeShelfItems(recentlyPlayedItems, shelf.items).length >
                MAX_HOME_SHELF_ITEMS),
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

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    if (!scrollContainer) return;

    let isScrolling = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let scrollStateFrame: number | undefined;

    const finishScrolling = () => {
      idleTimer = undefined;
      isScrolling = false;
      if (scrollStateFrame !== undefined) {
        cancelAnimationFrame(scrollStateFrame);
        scrollStateFrame = undefined;
      }
      delete scrollContainer.dataset.performanceScrolling;
    };

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        // Commit scrolling before the optional visual-work suppression runs.
        scrollStateFrame = requestAnimationFrame(() => {
          scrollStateFrame = undefined;
          if (isScrolling) {
            scrollContainer.dataset.performanceScrolling = "true";
          }
        });
      }

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finishScrolling, HOME_SCROLL_IDLE_MS);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (idleTimer) clearTimeout(idleTimer);
      if (scrollStateFrame !== undefined) cancelAnimationFrame(scrollStateFrame);
      delete scrollContainer.dataset.performanceScrolling;
    };
  }, []);

  return (
    <>
      {loadingShelfId ? (
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

      {loading && (
        <>
          <MediaShelfSkeleton displayKind="MusicNotesHeroShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
        </>
      )}

      {error && <p className="mx-(--bodyGutter) text-red-500">{error}</p>}
      {shelfLoadError && (
        <p className="mx-(--bodyGutter) text-red-500">{shelfLoadError}</p>
      )}

      {!loading &&
        !error &&
        (selectedShelf
          ? null
          : homeShelves.map((shelf, index) => {
              return (
                <MediaShelf
                  key={shelf.id}
                  title={shelf.title}
                  displayKind={homePreviewDisplayKind(shelf.displayKind)}
                  items={shelf.items}
                  prioritizeFirstCard={index === 0}
                  shelfId={shelf.id}
                  scrollToStartKey={
                    shelf.id === RECENTLY_PLAYED_SHELF_ID
                      ? shelf.items[0]?.id
                      : undefined
                  }
                  onSelect={shelf.hasMore ? handleSelectShelf : undefined}
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

function positionDailyMixShelf(
  shelves: ReturnType<typeof mapHomeRecommendations>,
) {
  const dailyMix = shelves.find((shelf) => shelf.id === DAILY_MIX_SHELF_ID);
  const stationsForYou = shelves.find(
    (shelf) => shelf.id === STATIONS_FOR_YOU_SHELF_ID,
  );
  const recentlyPlayedIndex = shelves.findIndex(
    (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
  );

  if (!dailyMix || recentlyPlayedIndex < 0) return shelves;

  const shelvesWithoutSystemMixes = shelves.filter(
    (shelf) =>
      shelf.id !== DAILY_MIX_SHELF_ID &&
      shelf.id !== STATIONS_FOR_YOU_SHELF_ID,
  );
  const recentIndexWithoutSystemMixes = shelvesWithoutSystemMixes.findIndex(
    (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
  );
  const targetIndex = Math.min(
    recentIndexWithoutSystemMixes + DAILY_MIX_SHELF_GAP + 1,
    shelvesWithoutSystemMixes.length,
  );
  const systemMixShelves = [dailyMix, ...(stationsForYou ? [stationsForYou] : [])];

  return [
    ...shelvesWithoutSystemMixes.slice(0, targetIndex),
    ...systemMixShelves,
    ...shelvesWithoutSystemMixes.slice(targetIndex),
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

  return sourceItems.slice(0, MAX_HOME_SHELF_ITEMS);
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
