import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";

type AlbumPageProps = {
  params: Promise<{ url: string; albumId: string }>;
  searchParams: Promise<{ trackId?: string }>;
};

export default async function AlbumPage({
  params,
  searchParams,
}: AlbumPageProps) {
  const { albumId } = await params;
  const { trackId } = await searchParams;

  return (
    <CatalogDetailPage
      resourceType="albums"
      resourceId={albumId}
      initialSelectedTrackId={trackId}
    />
  );
}
