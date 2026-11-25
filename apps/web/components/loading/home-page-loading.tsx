import MediaShelfSkeleton from "./media-shelf-skeleton";

export function HomePageHeading({ ready = true }: { ready?: boolean }) {
  return (
    <>
      <div
        data-app-scroll-ready={ready}
        className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8"
      >
        <h1 className="text-(--systemPrimary) [font:var(--header-emphasized)] col-1 row-1">
          Home
        </h1>
      </div>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-7" />
    </>
  );
}

export default function HomePageLoading() {
  return (
    <>
      <HomePageHeading ready={false} />
      <MediaShelfSkeleton displayKind="MusicNotesHeroShelf" />
      <MediaShelfSkeleton displayKind="MusicCoverShelf" />
      <MediaShelfSkeleton displayKind="MusicCoverShelf" isMoreLike />
    </>
  );
}
