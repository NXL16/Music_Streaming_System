import { memo, type CSSProperties } from "react";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type { MediaCardProps } from "@/components/media/media-card.types";

export type MediaShelfDisplayKind =
  | "MusicNotesHeroShelf"
  | "MusicCoverShelf";

export type MediaShelfProps = {
  title: string;
  displayKind: MediaShelfDisplayKind;
  items: MediaCardProps[];
};

const mediaShelfPresets = {
  MusicNotesHeroShelf: {
    "--grid-max-content-xsmall": "200px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "3",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "4",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "5",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "5",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "C",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
    "--shelf-aspect-ratio": "1.00",
  },

  MusicCoverShelf: {
    "--grid-max-content-xsmall": "144px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "4",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "5",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "6",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "6",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "G",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
  },
};

const mediaShelfVisibility = {
  MusicNotesHeroShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 640px",
  },
  MusicCoverShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 380px",
  },
} satisfies Record<MediaShelfDisplayKind, CSSProperties>;

function MediaShelf({
  title,
  displayKind,
  items,
}: MediaShelfProps) {
  const isHeroShelf = displayKind === "MusicNotesHeroShelf";

  return (
    <div
      className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3"
      style={mediaShelfVisibility[displayKind]}
    >
      <div>
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
              <span>{title}</span>
            </h2>
          </div>
        </div>

        <div className="pb-8">
          <section
            className="box-border px-(--shelfGridPaddingInline,var(--bodyGutter)) relative w-full z-(--z-default)"
            style={mediaShelfPresets[displayKind] as CSSProperties}
          >
            <div className="box-content -mx-0.5 overflow-visible px-0.5 w-full">
              <ul
                className={`shelf-grid__list svelte-ranejh ${isHeroShelf ? "shelf-grid__list--align-items-end" : ""}`}
              >
                {items.map((card) => (
                  <MediaCardRenderer key={card.id} {...card} />
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default memo(MediaShelf);
