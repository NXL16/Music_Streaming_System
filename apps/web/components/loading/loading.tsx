import { memo, type CSSProperties } from "react";

type MediaShelfDisplayKind = "MusicNotesHeroShelf" | "MusicCoverShelf";

interface MediaShelfSkeletonProps {
  displayKind: MediaShelfDisplayKind;
}

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

export default memo(function MediaShelfSkeleton({
  displayKind,
}: MediaShelfSkeletonProps) {
  const isHeroShelf = displayKind === "MusicNotesHeroShelf";
  const skeletonItems = Array.from({ length: 7 });

  return (
    <div
      className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3"
      style={mediaShelfVisibility[displayKind]}
    >
      <style>{`
        @keyframes master-diagonal-shimmer {
          0% { 
            background-position: 150% 150%; 
          }
          100% { 
            background-position: -150% -150%; 
          }
        }
        
        .perfect-sync-shimmer {
          background: #3a3a3a;
          background-image: linear-gradient(
            135deg, 
            #3a3a3a 20%, 
            #3f3f3f 30%, 
            #4a4a4a 40%, 
            #3f3f3f 50%, 
            #3a3a3a 60%
          );
          background-repeat: no-repeat;
          background-size: 250% 250%; /* Tăng size nền một chút để góc quét chéo phủ kín mượt mà */
          background-attachment: fixed;
          animation: master-diagonal-shimmer 1.4s infinite linear; /* Đã làm chậm lại để dải sáng lướt sang trọng hơn */
        }
      `}</style>

      <div>
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block leading-none">
              <div className="h-7 w-48 rounded-md perfect-sync-shimmer" />
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
                {skeletonItems.map((_, idx) => (
                  <li
                    key={idx}
                    className={`contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start -scroll-ms-(--standard-lockup-shadow-offset) ${
                      isHeroShelf ? "self-end" : ""
                    }`}
                  >
                    <div>
                      <div className="[--artworkShadowInset:inset_0_0_0_1px_var(--containerInnerStroke)]">
                        <div
                          className={`group ${
                            isHeroShelf
                              ? "[--feature-recommended-chin-height:68px] rounded-(--global-border-radius-xlarge,14px) mt-2.75 mb-2 relative align-baseline whitespace-normal w-full z-(--z-default) [--global-border-radius-xlarge:10px] aspect-3/4 overflow-hidden"
                              : "h-full min-w-0"
                          }`}
                        >
                          {isHeroShelf ? (
                            <div className="h-full w-full rounded-(--global-border-radius-xlarge,14px) relative perfect-sync-shimmer">
                              <div className="absolute bottom-0 w-full p-4 pb-5 space-y-2.5 z-10 text-start bg-linear-to-t from-[#3a3a3a] via-[#3a3a3a]/40 to-transparent">
                                <div className="h-4 w-1/3 bg-[#4a4a4a]/80 rounded" />
                                <div className="h-3.5 w-3/4 bg-[#4a4a4a]/50 rounded" />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default)">
                                <div
                                  className="rounded-[inherit] relative w-full perfect-sync-shimmer"
                                  style={{ aspectRatio: "1" }}
                                />
                              </div>

                              <div className="mt-1">
                                <div className="text-start space-y-1.5 pt-1.5">
                                  <div className="grid grid-cols-[minmax(0,1fr)_auto]">
                                    <div className="h-3.5 w-11/12 rounded perfect-sync-shimmer" />
                                  </div>

                                  <div className="h-3 w-7/12 rounded perfect-sync-shimmer" />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
});
