import { LibraryAlbumDetailPage } from "@/components/catalog/library-album-detail-page";

type LibraryAlbumPageProps = {
  params: Promise<{ albumId: string }>;
};

export default async function LibraryAlbumPage({
  params,
}: LibraryAlbumPageProps) {
  const { albumId } = await params;
  return <LibraryAlbumDetailPage albumId={albumId} />;
}
