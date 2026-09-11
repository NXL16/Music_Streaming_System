import { MusicVideoDetailPage } from "@/components/music-videos/music-video-detail-page";

type MusicVideoPageProps = {
  params: Promise<{ songVideoId: string }>;
};

export default async function MusicVideoPage({ params }: MusicVideoPageProps) {
  const { songVideoId } = await params;
  return <MusicVideoDetailPage songVideoId={songVideoId} />;
}
