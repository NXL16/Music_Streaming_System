"use client";

import { useEffect, useState } from "react";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import MediaCardRenderer from "./media-card-renderer";
import type { MediaCardProps } from "./media-card.types";
import Loading from "@/app/loading";

type ShelfDetailViewProps = {
  shelf: { title: string; items: MediaCardProps[] };
  onBack: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export function ShelfDetailView({
  shelf,
  onBack,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: ShelfDetailViewProps) {
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(
    null,
  );
  const showLoadingMore = useMinimumLoadingDuration(loadingMore);

  useEffect(() => {
    if (!loadMoreElement || !hasMore || loadingMore || !onLoadMore) return;
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { root: scrollContainer, rootMargin: "0px" },
    );
    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [hasMore, loadMoreElement, loadingMore, onLoadMore]);

  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
              <button
                onClick={onBack}
                className="flex items-center gap-x-2 appearance-none"
                type="button"
              >
                <svg
                  className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon)) rotate-180"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                >
                  <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z" />
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
        {showLoadingMore && <Loading fullScreen={false} size={29} />}
        {hasMore && (
          <div aria-hidden="true" ref={setLoadMoreElement} style={{ height: 1 }} />
        )}
      </div>
    </div>
  );
}

export function ShelfDetailLoading() {
  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8">
      <div className="flex min-h-[calc(100vh-16rem)] items-center justify-center">
        <Loading fullScreen={false} size={35} />
      </div>
    </div>
  );
}
