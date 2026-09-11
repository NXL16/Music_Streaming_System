import type { HlsConfig } from "hls.js";
import { getAccessToken } from "@/lib/auth/access-token-store";

export type AmbientHlsProfile = "card" | "hero";

const retry = (maxNumRetry: number, retryDelayMs: number) => ({
  maxNumRetry,
  retryDelayMs,
  maxRetryDelayMs: 4_000,
  backoff: "exponential" as const,
});

/**
 * HLS configuration for on-demand music videos. Low-latency live-stream
 * behavior wastes bandwidth for these VOD assets without improving UX.
 */
export function createAmbientHlsConfig(
  profile: AmbientHlsProfile,
): Partial<HlsConfig> {
  const isHero = profile === "hero";

  return {
    enableWorker: true,
    autoStartLoad: false,
    lowLatencyMode: false,
    capLevelToPlayerSize: !isHero,
    startFragPrefetch: isHero,
    maxBufferLength: isHero ? 20 : 4,
    maxMaxBufferLength: isHero ? 30 : 8,
    maxBufferSize: isHero ? 24_000_000 : 8_000_000,
    abrEwmaDefaultEstimate: isHero ? 2_000_000 : 750_000,
    xhrSetup: (xhr, url) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const requestOrigin = new URL(url, window.location.href).origin;
      const apiOrigin = new URL(apiUrl || window.location.href).origin;

      if (requestOrigin !== apiOrigin) return;

      const token = getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    },
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 15_000,
        timeoutRetry: retry(1, 500),
        errorRetry: retry(2, 500),
      },
    },
    playlistLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 15_000,
        timeoutRetry: retry(1, 500),
        errorRetry: retry(2, 500),
      },
    },
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 30_000,
        timeoutRetry: retry(2, 750),
        errorRetry: retry(3, 750),
      },
    },
  };
}
