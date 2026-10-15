import type Hls from "hls.js";
import {
  createAmbientHlsConfig,
  type AmbientHlsProfile,
} from "./ambient-hls-policy";
import { getAccessToken } from "@/lib/auth/access-token-store";

const MEDIA_RECOVERY_COOLDOWN_MS = 5_000;
const MAX_NETWORK_RECOVERY_ATTEMPTS = 1;
const SESSION_RECOVERY_DELAYS_MS = [1_000, 2_500, 5_000] as const;

let hlsRuntimePromise: Promise<typeof import("hls.js")> | undefined;

function loadHlsRuntime() {
  hlsRuntimePromise ??= import("hls.js").catch((error: unknown) => {
    hlsRuntimePromise = undefined;
    throw error;
  });
  return hlsRuntimePromise;
}

/** Starts downloading hls.js before a user presses play. */
export function preloadAmbientHlsRuntime() {
  // A later `start` retries loading if this speculative request fails.
  void loadHlsRuntime().catch(() => undefined);
}

export function isHlsPlaybackSource(src: string) {
  return /\.m3u8(?:$|[?#])/i.test(src);
}

type AmbientHlsPlayerOptions = {
  video: HTMLVideoElement;
  src: string;
  profile: AmbientHlsProfile;
  onPlayable: () => void;
  onReady: () => void;
  onFatalError: () => void;
};

export type AmbientHlsPlayer = {
  start: () => void;
  stopLoad: () => void;
  destroy: () => void;
};

/** Owns one HLS session, including bounded recovery and native fallback. */
export function createAmbientHlsPlayer({
  video,
  src,
  profile,
  onPlayable,
  onReady,
  onFatalError,
}: AmbientHlsPlayerOptions): AmbientHlsPlayer {
  let hls: Hls | null = null;
  let nativeCanPlayHandler: (() => void) | undefined;
  let nativeManifestObjectUrl: string | undefined;
  let nativeManifestAbortController: AbortController | undefined;
  let loading: Promise<void> | undefined;
  let destroyed = false;
  let lastMediaRecoveryAt = 0;
  let networkRecoveryAttempts = 0;
  let reportedReady = false;
  let loadRequested = false;
  let sessionRecoveryAttempts = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanupNativeHandler = () => {
    if (!nativeCanPlayHandler) return;
    video.removeEventListener("canplay", nativeCanPlayHandler);
    nativeCanPlayHandler = undefined;
  };

  const clearRecoveryTimer = () => {
    if (!recoveryTimer) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  };

  const clearMediaSource = () => {
    cleanupNativeHandler();
    nativeManifestAbortController?.abort();
    nativeManifestAbortController = undefined;
    if (nativeManifestObjectUrl) URL.revokeObjectURL(nativeManifestObjectUrl);
    nativeManifestObjectUrl = undefined;
    video.currentTime = 0;
    video.removeAttribute("src");
    video.load();
  };

  const restartAfterFatalError = () => {
    if (destroyed || !loadRequested) return;
    const delay = SESSION_RECOVERY_DELAYS_MS[sessionRecoveryAttempts];
    if (delay === undefined) {
      onFatalError();
      return;
    }

    sessionRecoveryAttempts += 1;
    hls?.destroy();
    hls = null;
    clearMediaSource();
    clearRecoveryTimer();
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      start();
    }, delay);
  };

  const startNativeFallback = () => {
    if (destroyed || !loadRequested || nativeManifestObjectUrl) return;
    if (!video.canPlayType("application/vnd.apple.mpegurl")) {
      restartAfterFatalError();
      return;
    }

    nativeCanPlayHandler = () => {
      if (destroyed) return;
      sessionRecoveryAttempts = 0;
      onReady();
      onPlayable();
    };
    // Native HLS cannot attach a Bearer header. Fetch the authenticated master
    // playlist once, then use its CDN-absolute child references from a Blob.
    const headers = new Headers();
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const abortController = new AbortController();
    nativeManifestAbortController = abortController;
    void fetch(src, { headers, signal: abortController.signal })
      .then(async (response) => {
        if (
          !response.ok ||
          destroyed ||
          !loadRequested ||
          nativeManifestAbortController !== abortController
        ) {
          throw new Error("HLS_MANIFEST_UNAVAILABLE");
        }
        const playlist = await response.text();
        if (
          destroyed ||
          !loadRequested ||
          nativeManifestAbortController !== abortController
        ) {
          return;
        }
        nativeManifestAbortController = undefined;
        nativeManifestObjectUrl = URL.createObjectURL(
          new Blob([playlist], { type: "application/vnd.apple.mpegurl" }),
        );
        video.addEventListener("canplay", nativeCanPlayHandler!);
        video.src = nativeManifestObjectUrl;
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        restartAfterFatalError();
      });
  };

  const start = () => {
    if (destroyed) return;
    loadRequested = true;
    clearRecoveryTimer();
    if (hls) {
      hls.startLoad(-1);
      onPlayable();
      return;
    }
    if (loading) return;

    loading = loadHlsRuntime()
      .then(({ default: HlsRuntime }) => {
        if (destroyed || !loadRequested || hls) return;
        if (!HlsRuntime.isSupported()) {
          startNativeFallback();
          return;
        }

        const instance = new HlsRuntime(createAmbientHlsConfig(profile));
        hls = instance;

        instance.on(HlsRuntime.Events.MANIFEST_PARSED, () => {
          if (destroyed || !loadRequested || hls !== instance) return;
          instance.startLoad(-1);
          onPlayable();
        });

        instance.on(HlsRuntime.Events.FRAG_BUFFERED, () => {
          if (destroyed || !loadRequested || hls !== instance) return;
          if (!reportedReady) {
            reportedReady = true;
            networkRecoveryAttempts = 0;
            sessionRecoveryAttempts = 0;
            onReady();
          }
        });

        instance.on(HlsRuntime.Events.ERROR, (_event, data) => {
          if (destroyed || hls !== instance || !data.fatal) return;

          if (data.type === HlsRuntime.ErrorTypes.MEDIA_ERROR) {
            const now = Date.now();
            if (now - lastMediaRecoveryAt >= MEDIA_RECOVERY_COOLDOWN_MS) {
              lastMediaRecoveryAt = now;
              instance.recoverMediaError();
              return;
            }
          }

          if (
            data.type === HlsRuntime.ErrorTypes.NETWORK_ERROR &&
            networkRecoveryAttempts < MAX_NETWORK_RECOVERY_ATTEMPTS
          ) {
            networkRecoveryAttempts += 1;
            instance.loadSource(src);
            instance.startLoad(-1);
            return;
          }

          restartAfterFatalError();
        });

        instance.loadSource(src);
        instance.attachMedia(video);
      })
      .catch(startNativeFallback)
      .finally(() => {
        loading = undefined;
      });
  };

  return {
    start,
    stopLoad: () => {
      loadRequested = false;
      clearRecoveryTimer();
      hls?.stopLoad();
    },
    destroy: () => {
      destroyed = true;
      loadRequested = false;
      clearRecoveryTimer();
      hls?.destroy();
      hls = null;
      clearMediaSource();
    },
  };
}
