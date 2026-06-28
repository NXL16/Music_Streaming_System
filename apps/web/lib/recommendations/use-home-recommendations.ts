"use client";

import { useEffect, useState } from "react";
import { getHomeRecommendations } from "./recommendation.api";
import type { RecommendationResponse } from "./recommendation.types";

export function useHomeRecommendations() {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getHomeRecommendations(controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Không thể tải nội dung đề xuất.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
