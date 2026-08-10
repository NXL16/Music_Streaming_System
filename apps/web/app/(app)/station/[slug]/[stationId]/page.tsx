import { StationDetailPage } from "@/components/station/station-detail-page";

type StationPageProps = {
  params: Promise<{ slug: string; stationId: string }>;
};

export default async function StationPage({ params }: StationPageProps) {
  const { stationId } = await params;
  return <StationDetailPage stationId={stationId} />;
}
