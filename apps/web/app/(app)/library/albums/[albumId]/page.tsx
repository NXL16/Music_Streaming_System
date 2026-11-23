import { LibraryAlbumDetailPage } from "@/components/catalog/library-album-detail-page";

type LibraryAlbumPageProps = {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<{ trackId?: string }>;
};

export default async function LibraryAlbumPage({
  params,
  searchParams,
}: LibraryAlbumPageProps) {
  const { albumId } = await params;
  const { trackId } = await searchParams;
  return (
    <LibraryAlbumDetailPage albumId={albumId} initialSelectedTrackId={trackId} />
  );
}
