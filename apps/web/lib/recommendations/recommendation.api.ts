import { http } from "@/lib/api/http";
import type { RecommendationResponse } from "./recommendation.types";

export async function getHomeRecommendations(signal?: AbortSignal) {
  const response = await http.get<RecommendationResponse>(
    "/me/recommendations",
    {
      signal,
      params: {
        name: "listen-now",
        l: "en-GB",
        timezone: "+07:00",
        platform: "web",
      },
    },
  );

  return response.data;
}
