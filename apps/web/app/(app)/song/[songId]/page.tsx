import { SongDetailPage } from "@/components/catalog/song-detail-page";

type SongPageProps = {
  params: Promise<{ songId: string }>;
};

export default async function SongPage({ params }: SongPageProps) {
  const { songId } = await params;
  return <SongDetailPage songId={songId} />;
}
