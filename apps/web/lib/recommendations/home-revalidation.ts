import { invalidateHomeRecommendationsCache } from "./recommendation.api";

export const HOME_RECOMMENDATIONS_STALE_EVENT =
  "recommendations:home-stale";

/**
 * Tells an already mounted Home to revalidate after the server has processed
 * a behavioural signal. The Home hook debounces this event, so an outbox
 * batch remains one follow-up request.
 */
export function notifyHomeRecommendationsStale() {
  invalidateHomeRecommendationsCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HOME_RECOMMENDATIONS_STALE_EVENT));
  }
}
