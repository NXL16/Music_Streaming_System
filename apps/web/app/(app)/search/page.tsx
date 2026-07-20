"use client";

import { useState } from "react";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { useCatalogSearch } from "@/lib/catalog/use-catalog-search";

const GRID_CLASSNAME =
  "grid list-none grid-cols-2 gap-x-5 gap-y-6 m-0 px-(--bodyGutter) pb-10 pt-0 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4 min-[1260px]:grid-cols-5 min-[1580px]:grid-cols-6 min-[1940px]:grid-cols-7";

function ResultSection({
  title,
  items,
}: {
  title: string;
  items: MediaCardProps[];
}) {
  if (!items.length) return null;

  return (
    <section className="pb-4">
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

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const { results, loading, error } = useCatalogSearch(query);

  const trimmed = query.trim();
  const showNoResults =
    !loading && !error && trimmed.length > 0 && results.isEmpty;

  return (
    <MusicPageLayout>
      <header className="mx-(--bodyGutter) mb-5 pt-1">
        <div className="flex items-center gap-3 rounded-lg bg-(--fillTertiary,#7676801f) px-4 py-3">
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
            placeholder="Nghệ sĩ, bài hát, album"
            aria-label="Tìm kiếm"
            className="min-w-0 flex-1 bg-transparent text-(--systemPrimary) [font:var(--body-tall)] outline-none placeholder:text-(--systemSecondary)"
          />
        </div>
      </header>

      {error && (
        <p className="mx-(--bodyGutter) text-(--keyColor) [font:var(--callout)]">
          {error}
        </p>
      )}

      {!error && trimmed.length > 0 && (
        <>
          <ResultSection title="Bài hát" items={results.songs} />
          <ResultSection title="Nghệ sĩ" items={results.artists} />
          <ResultSection title="Album" items={results.albums} />
        </>
      )}

      {showNoResults && (
        <p className="mx-(--bodyGutter) py-6 text-(--systemSecondary) [font:var(--callout)]">
          Không tìm thấy kết quả cho “{trimmed}”.
        </p>
      )}

      {!trimmed && (
        <p className="mx-(--bodyGutter) py-6 text-(--systemSecondary) [font:var(--callout)]">
          Tìm kiếm bài hát, nghệ sĩ và album.
        </p>
      )}
    </MusicPageLayout>
  );
}
