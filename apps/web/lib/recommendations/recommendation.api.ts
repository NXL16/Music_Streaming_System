import { http } from "@/lib/api/http";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import type { RecommendationResponse } from "./recommendation.types";

const RECOMMENDATION_LOCALE = "en-GB";
const CACHE_TTL_MS = 5 * 60 * 1000;
const NAVIGATION_HANDOFF_TTL_MS = 15_000;
// Local development can opt out of every client-side Home cache so database
// and recommendation changes are visible on the very next navigation.
const HOME_CACHE_DISABLED = developmentCacheDisabled;

let pendingHomeRecommendations: Promise<RecommendationResponse> | null = null;
const pendingRecommendationSections = new Map<
  string,
  Promise<RecommendationResponse>
>();
let cachedResponse: RecommendationResponse | null = null;
let cacheExpiresAt = 0;
let cacheGeneration = 0;
let navigationHandoff: RecommendationResponse | null = null;
let navigationHandoffExpiresAt = 0;
const IMPRESSION_BATCH_DELAY_MS = 250;
const MAX_IMPRESSIONS_PER_BATCH = 48;
const RECOMMENDATION_OPEN_CONTEXT_KEY = "recommendation-open-context";
const RECOMMENDATION_OPEN_CONTEXT_TTL_MS = 15 * 60 * 1000;

type RecommendationInteractionInput = {
  sectionId: string;
  resourceType: string;
  resourceId: string;
  position: number;
  modelVersion: number;
  eventType: "impression" | "open" | "play";
};

type RecommendationOpenContext = Omit<
  RecommendationInteractionInput,
  "eventType"
> & {
  expiresAt: number;
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
  if (HOME_CACHE_DISABLED) {
    if (navigationHandoff && Date.now() < navigationHandoffExpiresAt) {
      return navigationHandoff;
    }
    navigationHandoff = null;
    navigationHandoffExpiresAt = 0;
    return null;
  }
  if (cachedResponse && Date.now() < cacheExpiresAt) {
    return cachedResponse;
  }
  return null;
}

// This is intentionally not a general cache. It lets Home reuse the exact
// response fetched by the Welcome screen during the immediately following
// navigation, even while development caching is disabled.
export function handoffHomeRecommendations(response: RecommendationResponse) {
  navigationHandoff = response;
  navigationHandoffExpiresAt = Date.now() + NAVIGATION_HANDOFF_TTL_MS;
}

export function invalidateHomeRecommendationsCache() {
  cacheGeneration += 1;
  cachedResponse = null;
  cacheExpiresAt = 0;
  navigationHandoff = null;
  navigationHandoffExpiresAt = 0;
  // Do not reuse a request started before a playback event. It can resolve
  // after invalidation and otherwise make Recently Played appear unchanged.
  pendingHomeRecommendations = null;
}

export async function getHomeRecommendations() {
  if (!HOME_CACHE_DISABLED && cachedResponse && Date.now() < cacheExpiresAt) {
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

export function getRecommendationSection(sectionId: string) {
  const pending = pendingRecommendationSections.get(sectionId);
  if (pending) return pending;

  const request = http
    .get<RecommendationResponse>(
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
    )
    .then((response) => response.data)
    .finally(() => {
      pendingRecommendationSections.delete(sectionId);
    });

  pendingRecommendationSections.set(sectionId, request);
  return request;
}

export function recordRecommendationInteraction(
  input: RecommendationInteractionInput,
) {
  if (input.eventType === "impression") {
    queueRecommendationImpression(input);
    return;
  }

  if (input.eventType === "open") {
    rememberRecommendationOpen(input);
  }

  return http.post("/me/recommendations/interactions", input).catch(() => {
    // Feedback must never block navigation or playback.
  });
}

function rememberRecommendationOpen(input: RecommendationInteractionInput) {
  if (typeof window === "undefined") return;
  const context: RecommendationOpenContext = {
    sectionId: input.sectionId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    position: input.position,
    modelVersion: input.modelVersion,
    expiresAt: Date.now() + RECOMMENDATION_OPEN_CONTEXT_TTL_MS,
  };
  try {
    window.sessionStorage.setItem(
      RECOMMENDATION_OPEN_CONTEXT_KEY,
      JSON.stringify(context),
    );
  } catch {
    // Storage may be unavailable in a restricted browser context. Telemetry
    // remains best-effort and must not interrupt navigation.
  }
}

/**
 * Attributes a play from an album/playlist detail page to the recommendation
 * card that opened it. The context is single-use and expires quickly so an
 * unrelated later playback is never counted as a recommendation conversion.
 */
export function recordPlayFromRecommendationOpen(
  resourceType: string,
  resourceId: string,
) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(RECOMMENDATION_OPEN_CONTEXT_KEY);
    if (!raw) return;
    const context = JSON.parse(raw) as RecommendationOpenContext;
    if (
      context.expiresAt < Date.now() ||
      context.resourceType !== resourceType ||
      context.resourceId !== resourceId
    ) {
      if (context.expiresAt < Date.now()) {
        window.sessionStorage.removeItem(RECOMMENDATION_OPEN_CONTEXT_KEY);
      }
      return;
    }
    window.sessionStorage.removeItem(RECOMMENDATION_OPEN_CONTEXT_KEY);
    void recordRecommendationInteraction({
      sectionId: context.sectionId,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      position: context.position,
      modelVersion: context.modelVersion,
      eventType: "play",
    });
  } catch {
    // Invalid or unavailable session storage must not affect playback.
  }
}
