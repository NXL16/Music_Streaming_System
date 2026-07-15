import { ArtistTopSongsPage } from "@/components/catalog/artist-top-songs-page";

type ArtistTopSongsRouteProps = {
  params: Promise<{ artistId: string }>;
};

export default async function ArtistTopSongsRoute({
  params,
}: ArtistTopSongsRouteProps) {
  const { artistId } = await params;

  return <ArtistTopSongsPage artistId={artistId} />;
}
