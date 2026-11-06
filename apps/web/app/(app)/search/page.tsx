"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import {
  CATALOG_SEARCH_FILTERS,
  type CatalogSearchFilter,
  useCatalogSearch,
} from "@/lib/catalog/use-catalog-search";

const GRID_CLASSNAME =
  "grid list-none grid-cols-2 gap-x-5 gap-y-6 m-0 px-(--bodyGutter) pb-10 pt-0 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4 min-[1260px]:grid-cols-5 min-[1580px]:grid-cols-6 min-[1940px]:grid-cols-7";

const FILTER_LABELS: Record<CatalogSearchFilter, string> = {
  all: "Tất cả",
  songs: "Bài hát",
  artists: "Nghệ sĩ",
  albums: "Album",
  playlists: "Playlist",
};

function parseFilter(value: string | null): CatalogSearchFilter {
  return CATALOG_SEARCH_FILTERS.includes(value as CatalogSearchFilter)
    ? (value as CatalogSearchFilter)
    : "all";
}

function ResultSection({
  title,
  items,
}: {
  title: string;
  items: MediaCardProps[];
}) {
  if (!items.length) return null;

  return (
    <section className="pb-4" aria-label={title}>
      <h2 className="mx-(--bodyGutter) mb-3 text-(--systemPrimary) [font:var(--title-3-emphasized)]">
        {title}
      </h2>
      <ul className={GRID_CLASSNAME}>
        {items.map((card) => (
          <MediaCardRenderer key={card.id} {...card} />
        ))}
      </ul>
    </section>
  );
}

function SearchResultsSkeleton() {
  return (
    <section aria-label="Đang tải kết quả tìm kiếm" aria-busy="true">
      <div className="mx-(--bodyGutter) mb-3 h-6 w-28 animate-pulse rounded bg-(--fillTertiary,#7676801f)" />
      <div className={GRID_CLASSNAME}>
        {Array.from({ length: 7 }, (_, index) => (
          <li key={index} className="animate-pulse">
            <div className="aspect-square rounded-[7px] bg-(--fillTertiary,#7676801f)" />
            <div className="mt-2 h-4 w-4/5 rounded bg-(--fillTertiary,#7676801f)" />
            <div className="mt-1 h-3 w-3/5 rounded bg-(--fillTertiary,#7676801f)" />
          </li>
        ))}
      </div>
    </section>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlFilter = parseFilter(searchParams.get("type"));
  const [query, setQuery] = useState(urlQuery);
  const [filter, setFilter] = useState<CatalogSearchFilter>(urlFilter);
  const { results, loading, error } = useCatalogSearch(query, filter);
  const trimmedQuery = query.trim();
  const hasQuery = Boolean(trimmedQuery);
  const showNoResults = hasQuery && !loading && !error && results.isEmpty;
  const searchSummary = useMemo(() => {
    if (!hasQuery) return "";
    return `Kết quả cho “${trimmedQuery}”`;
  }, [hasQuery, trimmedQuery]);

  // Keep a shareable URL without creating a history entry for every keystroke.
  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentQuery = searchParams.get("q") ?? "";
    const currentFilter = parseFilter(searchParams.get("type"));

    if (normalizedQuery === currentQuery && filter === currentFilter) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (normalizedQuery) params.set("q", normalizedQuery);
      if (filter !== "all") params.set("type", filter);
      const target = params.size ? `${pathname}?${params}` : pathname;
      router.replace(target, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [filter, pathname, query, router, searchParams]);

  return (
    <MusicPageLayout>
      <header className="mx-(--bodyGutter) mb-5 pt-1">
        <h1 className="mb-4 text-(--systemPrimary) [font:var(--large-title)]">
          Tìm kiếm
        </h1>
        <div className="flex items-center gap-3 rounded-lg bg-(--fillTertiary,#7676801f) px-4 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--keyColor)">
          <svg
            aria-hidden="true"
            className="h-5 w-5 shrink-0 fill-(--systemSecondary)"
            viewBox="0 0 24 24"
          >
            <path d="M17.979 18.553c.476 0 .813-.366.813-.835a.807.807 0 0 0-.235-.586l-3.45-3.457a5.61 5.61 0 0 0 1.158-3.413c0-3.098-2.535-5.633-5.633-5.633C7.542 4.63 5 7.156 5 10.262c0 3.098 2.534 5.632 5.632 5.632a5.614 5.614 0 0 0 3.274-1.055l3.472 3.472a.835.835 0 0 0 .6.242zm-7.347-3.875c-2.417 0-4.416-2-4.416-4.416 0-2.417 2-4.417 4.416-4.417 2.417 0 4.417 2 4.417 4.417s-2 4.416-4.417 4.416z" />
          </svg>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nghệ sĩ, bài hát, album hoặc playlist"
            aria-label="Tìm kiếm"
            className="min-w-0 flex-1 bg-transparent text-(--systemPrimary) [font:var(--body-tall)] outline-none placeholder:text-(--systemSecondary)"
          />
          {loading && (
            <span
              aria-label="Đang tìm kiếm"
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-(--systemSecondary) border-t-transparent"
            />
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Xóa tìm kiếm"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-(--systemSecondary) text-(--systemBackground) hover:opacity-80"
            >
              <span
                aria-hidden="true"
                className="relative -top-px text-sm leading-none"
              >
                ×
              </span>
            </button>
          )}
        </div>

        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Lọc kết quả"
        >
          {CATALOG_SEARCH_FILTERS.map((item) => {
            const selected = filter === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(item)}
                className={`shrink-0 rounded-full px-3 py-1.5 [font:var(--subhead-emphasized)] ${
                  selected
                    ? "bg-(--keyColor) text-(--systemBackground)"
                    : "bg-(--fillTertiary,#7676801f) text-(--systemPrimary) hover:bg-(--fillSecondary)"
                }`}
              >
                {FILTER_LABELS[item]}
              </button>
            );
          })}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {loading ? "Đang tìm kiếm" : error || searchSummary}
      </p>

      {error && (
        <p className="mx-(--bodyGutter) py-6 text-(--keyColor) [font:var(--callout)]">
          {error}
        </p>
      )}

      {!error && loading && <SearchResultsSkeleton />}

      {!error && !loading && hasQuery && !results.isEmpty && (
        <>
          <h2 className="mx-(--bodyGutter) mb-4 text-(--systemPrimary) [font:var(--title-2-emphasized)]">
            {searchSummary}
          </h2>
          <ResultSection title="Bài hát" items={results.songs} />
          <ResultSection title="Nghệ sĩ" items={results.artists} />
          <ResultSection title="Album" items={results.albums} />
          <ResultSection title="Playlist" items={results.playlists} />
        </>
      )}

      {showNoResults && (
        <p className="mx-(--bodyGutter) py-6 text-(--systemSecondary) [font:var(--callout)]">
          Không tìm thấy kết quả cho “{trimmedQuery}”.
        </p>
      )}

      {!hasQuery && (
        <p className="mx-(--bodyGutter) py-6 text-(--systemSecondary) [font:var(--callout)]">
          Tìm kiếm bài hát, nghệ sĩ, album hoặc playlist.
        </p>
      )}
    </MusicPageLayout>

    // <div className=""></div>
  );
}
