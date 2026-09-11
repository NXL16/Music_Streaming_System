import { SongDetailPage } from "@/components/catalog/song-detail-page";

type SongPageProps = {
  params: Promise<{ songId: string }>;
};

export default async function SongPage({ params }: SongPageProps) {
  const { songId: releaseTrackId } = await params;
  return <SongDetailPage releaseTrackId={releaseTrackId} />;
}
