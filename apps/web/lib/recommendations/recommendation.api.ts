import { http } from "@/lib/api/http";
import type { RecommendationResponse } from "./recommendation.types";

const RECOMMENDATION_LOCALE = "en-GB";
const CACHE_TTL_MS = 5 * 60 * 1000;
// Local development can opt out of every client-side Home cache so database
// and recommendation changes are visible on the very next navigation.
const HOME_CACHE_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_HOME_CACHE === "true";

let pendingHomeRecommendations: Promise<RecommendationResponse> | null = null;
let cachedResponse: RecommendationResponse | null = null;
let cacheExpiresAt = 0;
let cacheGeneration = 0;
const IMPRESSION_BATCH_DELAY_MS = 250;
const MAX_IMPRESSIONS_PER_BATCH = 48;

type RecommendationInteractionInput = {
  sectionId: string;
  resourceType: string;
  resourceId: string;
  position: number;
  modelVersion: number;
  eventType: "impression" | "open" | "play";
};

const pendingImpressions = new Map<string, RecommendationInteractionInput>();
let impressionFlushTimer: ReturnType<typeof setTimeout> | undefined;

function flushRecommendationImpressions() {
  if (impressionFlushTimer) {
    clearTimeout(impressionFlushTimer);
    impressionFlushTimer = undefined;
  }

  const interactions = [...pendingImpressions.values()].slice(
    0,
    MAX_IMPRESSIONS_PER_BATCH,
  );
  interactions.forEach((interaction) => {
    pendingImpressions.delete(
      `${interaction.sectionId}:${interaction.resourceType}:${interaction.resourceId}`,
    );
  });
  if (interactions.length === 0) return;

  void http
    .post("/me/recommendations/interactions/batch", { interactions })
    .catch(() => {
      // Telemetry must never block rendering, navigation, or playback.
    });

  if (pendingImpressions.size > 0) {
    impressionFlushTimer = setTimeout(
      flushRecommendationImpressions,
      IMPRESSION_BATCH_DELAY_MS,
    );
  }
}

function queueRecommendationImpression(input: RecommendationInteractionInput) {
  const key = `${input.sectionId}:${input.resourceType}:${input.resourceId}`;
  pendingImpressions.set(key, input);

  if (pendingImpressions.size >= MAX_IMPRESSIONS_PER_BATCH) {
    flushRecommendationImpressions();
    return;
  }
  if (!impressionFlushTimer) {
    impressionFlushTimer = setTimeout(
      flushRecommendationImpressions,
      IMPRESSION_BATCH_DELAY_MS,
    );
  }
}

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
  if (HOME_CACHE_DISABLED) return null;
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
  if (
    !HOME_CACHE_DISABLED &&
    cachedResponse &&
    Date.now() < cacheExpiresAt
  ) {
    return cachedResponse;
  }
  // Concurrent consumers (for example splash prefetch and Home mounting) can
  // share a live request without serving stale data. This remains active in
  // development even when the completed-response cache is disabled.
  if (pendingHomeRecommendations) return pendingHomeRecommendations;

  const requestGeneration = cacheGeneration;
  const request = http
    .get<RecommendationResponse>("/me/recommendations", {
      params: {
        name: "listen-now",
        l: RECOMMENDATION_LOCALE,
        timezone: getBrowserTimezone(),
        platform: "web",
        ...(HOME_CACHE_DISABLED ? { _fresh: Date.now() } : {}),
      },
      ...(HOME_CACHE_DISABLED
        ? {
            headers: {
              "Cache-Control": "no-store, no-cache, max-age=0",
              Pragma: "no-cache",
            },
          }
        : {}),
    })
    .then((response) => {
      if (!HOME_CACHE_DISABLED && requestGeneration === cacheGeneration) {
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
        ...(HOME_CACHE_DISABLED ? { _fresh: Date.now() } : {}),
      },
      ...(HOME_CACHE_DISABLED
        ? {
            headers: {
              "Cache-Control": "no-store, no-cache, max-age=0",
              Pragma: "no-cache",
            },
          }
        : {}),
    },
  );

  return response.data;
}

export function recordRecommendationInteraction(
  input: RecommendationInteractionInput,
) {
  if (input.eventType === "impression") {
    queueRecommendationImpression(input);
    return;
  }

  return http.post("/me/recommendations/interactions", input).catch(() => {
    // Feedback must never block navigation or playback.
  });
}
