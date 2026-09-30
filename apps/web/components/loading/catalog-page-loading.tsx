import Loading from "@/app/loading";

/** Initial loader shared by catalog detail routes. */
export default function CatalogPageLoading() {
  return (
    <div className="catalog-page-loading min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) bg-(--joe-color,var(--pageBG)) flex min-h-dvh items-center justify-center">
      <Loading fullScreen={false} size={35} />
    </div>
  );
}
