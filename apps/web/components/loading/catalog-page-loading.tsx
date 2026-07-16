import Loading from "@/app/loading";

/** Initial loader shared by catalog detail routes. */
export default function CatalogPageLoading() {
  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8">
      <div className="flex min-h-[calc(100vh-16rem)] items-center justify-center">
        <Loading fullScreen={false} size={56} />
      </div>
    </div>
  );
}
