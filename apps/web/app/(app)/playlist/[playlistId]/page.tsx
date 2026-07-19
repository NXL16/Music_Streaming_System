import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";
import DailyMixPage from "@/components/catalog/daily-mix-page";
import { UserPlaylistPage } from "@/components/songs/user-playlist-page";
import { isDailyMixId } from "@/lib/recommendations/daily-mix";

type PlaylistPageProps = {
  params: Promise<{ playlistId: string }>;
  searchParams: Promise<{ library?: string }>;
};

export default async function PlaylistPage({
  params,
  searchParams,
}: PlaylistPageProps) {
  const { playlistId } = await params;
  const { library } = await searchParams;
  if (library === "1") {
    return <UserPlaylistPage playlistId={playlistId} />;
  }
  if (isDailyMixId(playlistId)) {
    return <DailyMixPage playlistId={playlistId} />;
  }

  return <CatalogDetailPage resourceType="playlists" resourceId={playlistId} />;
}
