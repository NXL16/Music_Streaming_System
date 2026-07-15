import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";
import DailyMixPage from "@/components/catalog/daily-mix-page";
import { isDailyMixId } from "@/lib/recommendations/daily-mix";

type PlaylistPageProps = {
  params: Promise<{ playlistId: string }>;
};

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { playlistId } = await params;
  if (isDailyMixId(playlistId)) {
    return <DailyMixPage playlistId={playlistId} />;
  }

  return <CatalogDetailPage resourceType="playlists" resourceId={playlistId} />;
}
