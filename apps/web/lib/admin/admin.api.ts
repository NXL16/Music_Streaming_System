import { http } from "@/lib/api/http";

type AdminPayload = Record<string, unknown>;

export async function listCatalogDrafts(params: AdminPayload = {}) {
  return (await http.get("/admin/catalog/drafts", { params })).data;
}

export async function getCatalogDraft(draftId: string) {
  return (
    await http.get(`/admin/catalog/drafts/${encodeURIComponent(draftId)}`)
  ).data;
}

export async function saveCatalogDraft(
  resourceType: "artists" | "songs" | "albums" | "playlists",
  payload: AdminPayload,
) {
  return (await http.post(`/admin/catalog/${resourceType}/draft`, payload))
    .data;
}

export async function publishCatalogDraft(draftId: string) {
  return (
    await http.post(
      `/admin/catalog/drafts/${encodeURIComponent(draftId)}/publish`,
    )
  ).data;
}

export async function deleteCatalogDraft(draftId: string) {
  return (
    await http.delete(`/admin/catalog/drafts/${encodeURIComponent(draftId)}`)
  ).data;
}

export async function listAssets(params: AdminPayload = {}) {
  return (await http.get("/admin/assets", { params })).data;
}

export async function getAsset(assetId: string) {
  return (await http.get(`/admin/assets/${encodeURIComponent(assetId)}`)).data;
}

export async function getAssetUsages(assetId: string) {
  return (await http.get(`/admin/assets/${encodeURIComponent(assetId)}/usages`))
    .data;
}

export async function requestAssetUpload(payload: AdminPayload) {
  return (await http.post("/admin/assets/uploads", payload)).data;
}

export async function finalizeAssetUpload(assetId: string) {
  return (
    await http.post(`/admin/assets/${encodeURIComponent(assetId)}/finalize`)
  ).data;
}

export async function deleteAsset(assetId: string) {
  return (await http.delete(`/admin/assets/${encodeURIComponent(assetId)}`))
    .data;
}

export async function bindSystemStationArtwork(
  stationKey: string,
  assetId: string,
) {
  return (
    await http.put(
      `/admin/recommendations/station-artwork/${encodeURIComponent(stationKey)}`,
      { assetId },
    )
  ).data;
}

export async function getAdminHomeRecommendations(params: AdminPayload = {}) {
  return (await http.get("/admin/recommendations/home", { params })).data;
}

export async function replaceAdminHomeRecommendations(payload: AdminPayload) {
  return (await http.put("/admin/recommendations/home", payload)).data;
}

export async function publishAdminHomeRecommendations(payload: AdminPayload) {
  return (await http.post("/admin/recommendations/home/publish", payload)).data;
}

export async function generateAdminHomeRecommendations(
  payload: AdminPayload = {},
) {
  return (await http.post("/admin/recommendations/home/generate", payload))
    .data;
}

export async function getAdminListeningAnalytics(days = 28) {
  return (
    await http.get("/admin/recommendations/analytics", { params: { days } })
  ).data as {
    plays: number;
    completions: number;
    skips: number;
    listeners: number;
    trend: Array<{
      date: string;
      plays: number;
      completions: number;
      skips: number;
      listeners: number;
    }>;
    topSongs: Array<{
      songId: string;
      title: string;
      artistName: string;
      plays: number;
      completions: number;
      skips: number;
      listeners: number;
    }>;
  };
}
