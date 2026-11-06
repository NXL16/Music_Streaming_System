"use client";

import MediaLockupGridShelf from "@/components/media/media-lockup-grid-shelf";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { MobileSearchMediaList } from "./mobile-search-media-list";

type RecentlySearchedProps = {
  items: MediaCardProps[];
  onClear: () => void;
};

export default function RecentlySearched({
  items,
  onClear,
}: RecentlySearchedProps) {
  if (!items.length) return null;

  return (
    <>
      <div className="max-[483px]:hidden">
        <MediaLockupGridShelf
          endAction={
            <div className="[--linkColor:var(--keyColor)] inline-block [font:var(--title-3)] z-[calc(var(--z-default)+1)]">
              <button
                className="block [text-align:inherit] w-full text-(--keyColor)"
                onClick={onClear}
                type="button"
              >
                Clear
              </button>
            </div>
          }
          items={items}
          listClassName="m-[0_var(--bodyGutter)_32px] grid gap-2.5 min-[1000px]:gap-5 [--numSearchColumns:1] grid-cols-[repeat(var(--numSearchColumns),1fr)] min-[1000px]:[--numSearchColumns:3] min-[1260px]:[--numSearchColumns:4] min-[1580px]:[--numSearchColumns:5]"
          lockupWrapperClassName="top-search-lockup-wrapper--recently-searched"
          sectionClassName="section-recently-searched-top-search-lockup"
          title="Recently Searched"
        />
      </div>

      <section className="min-[484px]:hidden pt-3">
        <div className="flex items-center justify-end m-[0_var(--bodyGutter)_13px]">
          <h2 className="flex-1 text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
            Recently Searched
          </h2>
          <button
            className="[font:var(--title-3)] text-(--keyColor)"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        </div>
        <div className="mx-(--bodyGutter)">
          <MobileSearchMediaList items={items} />
        </div>
      </section>
    </>
  );
}
