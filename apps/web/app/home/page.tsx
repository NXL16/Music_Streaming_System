"use client";

import { useMemo } from "react";
import { ProtectedPageShell } from "@/components/layout/protected-page-shell";
import MediaShelf from "@/components/media/media-shelf";
import { useHomeRecommendations } from "@/lib/recommendations/use-home-recommendations";
import { mapHomeRecommendations } from "@/lib/recommendations/recommendation.mapper";
import MediaShelfSkeleton from "@/components/loading/loading";

const MAX_HOME_SHELVES = 16;

export default function HomePage() {
  const { data, loading, error } = useHomeRecommendations();

  const shelves = useMemo(
    () => (data ? mapHomeRecommendations(data).slice(0, MAX_HOME_SHELVES) : []),
    [data],
  );

  return (
    <ProtectedPageShell>
      <div className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8">
        <h1 className="text-(--systemPrimary) [font:var(--header-emphasized)] col-1 row-1">
          Home
        </h1>
      </div>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-7">
        <div></div>
      </div>

      {loading && (
        <>
          <MediaShelfSkeleton displayKind="MusicNotesHeroShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
          <MediaShelfSkeleton displayKind="MusicCoverShelf" />
        </>
      )}

      {error && <p className="mx-(--bodyGutter) text-red-500">{error}</p>}

      {!loading &&
        !error &&
        shelves.map((shelf) => (
          <MediaShelf
            key={shelf.id}
            title={shelf.title}
            displayKind={shelf.displayKind}
            items={shelf.items}
          />
        ))}

      <svg style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg">
        <symbol id="play-circle-fill" viewBox="0 0 60 60">
          <path
            fill="var(--iconCircleFillBG, transparent)"
            d="M30 60c16.411 0 30-13.617 30-30C60 13.588 46.382 0 29.971 0 13.588 0 .001 13.588.001 30c0 16.383 13.617 30 30 30Z"
          />
          <path
            fill="var(--iconFillArrow, var(--keyColor, black))"
            d="M24.411 41.853c-1.41.853-3.028.177-3.028-1.294V19.47c0-1.44 1.735-2.058 3.028-1.294l17.265 10.235a1.89 1.89 0 0 1 0 3.265L24.411 41.853Z"
          />
        </symbol>
      </svg>
    </ProtectedPageShell>
  );
}
