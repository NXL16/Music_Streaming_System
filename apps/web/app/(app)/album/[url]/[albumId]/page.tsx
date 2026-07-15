import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";

type AlbumPageProps = {
  params: Promise<{ url: string; albumId: string }>;
};

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { albumId } = await params;
  return <CatalogDetailPage resourceType="albums" resourceId={albumId} />;
}
