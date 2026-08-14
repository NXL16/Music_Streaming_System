import { notFound } from "next/navigation";
import { CatalogDetailPage } from "@/components/catalog/catalog-detail-page";

type PlaylistPageProps = {
  params: Promise<{ segments: string[] }>;
};

/**
 * The only public playlist URL: /playlist/{slug}/{playlistId}.
 */
export default async function PlaylistPage({
  params,
}: PlaylistPageProps) {
  const { segments } = await params;
  const playlistId = segments[1];

  if (!playlistId || segments.length !== 2) notFound();

  return <CatalogDetailPage resourceType="playlists" resourceId={playlistId} />;
}
