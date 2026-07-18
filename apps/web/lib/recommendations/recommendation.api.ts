import { http } from "@/lib/api/http";
import type { RecommendationResponse } from "./recommendation.types";

const RECOMMENDATION_LOCALE = "en-GB";
const CACHE_TTL_MS = 5 * 60 * 1000;

let pendingHomeRecommendations: Promise<RecommendationResponse> | null = null;
let cachedResponse: RecommendationResponse | null = null;
let cacheExpiresAt = 0;
let cacheGeneration = 0;

function getBrowserTimezone() {
  try {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const hours = String(Math.floor(abs / 60)).padStart(2, "0");
    const minutes = String(abs % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  } catch {
    return "+07:00";
  }
}

// Đọc cache đồng bộ (không gọi mạng). Dùng để khởi tạo state ngay khi data
// đã được splash prefetch xong → trang home không chớp skeleton thừa.
export function getCachedHomeRecommendations(): RecommendationResponse | null {
  if (cachedResponse && Date.now() < cacheExpiresAt) {
    return cachedResponse;
  }
  return null;
}

export function invalidateHomeRecommendationsCache() {
  cacheGeneration += 1;
  cachedResponse = null;
  cacheExpiresAt = 0;
  // Do not reuse a request started before a playback event. It can resolve
  // after invalidation and otherwise make Recently Played appear unchanged.
  pendingHomeRecommendations = null;
}

export async function getHomeRecommendations() {
  if (cachedResponse && Date.now() < cacheExpiresAt) {
    return cachedResponse;
  }

  const requestGeneration = cacheGeneration;
  const request = http
    .get<RecommendationResponse>("/me/recommendations", {
      params: {
        name: "listen-now",
        l: RECOMMENDATION_LOCALE,
        timezone: getBrowserTimezone(),
        platform: "web",
      },
    })
    .then((response) => {
      if (requestGeneration === cacheGeneration) {
        cachedResponse = response.data;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      }
      return response.data;
    })
    .finally(() => {
      if (pendingHomeRecommendations === request) {
        pendingHomeRecommendations = null;
      }
    });
  pendingHomeRecommendations = request;

  return request;
}

export async function getRecommendationSection(sectionId: string) {
  const response = await http.get<RecommendationResponse>(
    `/me/recommendations/${encodeURIComponent(sectionId)}`,
    {
      params: {
        name: "listen-now",
        l: RECOMMENDATION_LOCALE,
        timezone: getBrowserTimezone(),
      },
    },
  );

  return response.data;
}
