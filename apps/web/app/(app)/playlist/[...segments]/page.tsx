import { notFound } from "next/navigation";
import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";
import { UserPlaylistPage } from "@/components/songs/user-playlist-page";

type PlaylistPageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ library?: string }>;
};

/**
 * The only public playlist URL: /playlist/{slug}/{playlistId}.
 */
export default async function PlaylistPage({
  params,
  searchParams,
}: PlaylistPageProps) {
  const { segments } = await params;
  const { library } = await searchParams;
  const playlistId = segments[1];

  if (!playlistId || segments.length !== 2) notFound();
  if (library === "1") return <UserPlaylistPage playlistId={playlistId} />;

  return <CatalogDetailPage resourceType="playlists" resourceId={playlistId} />;
}
