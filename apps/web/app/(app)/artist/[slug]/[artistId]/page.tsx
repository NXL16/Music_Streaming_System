import { ArtistDetailPage } from "@/components/catalog/artist-detail-page";

type ArtistPageProps = {
  params: Promise<{ slug: string; artistId: string }>;
};
export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug, artistId } = await params;
  return <ArtistDetailPage artistId={artistId} slug={slug} />;
}
