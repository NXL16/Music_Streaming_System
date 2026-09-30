"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "./use-player-store";
import { preloadCache } from "./mse/preload-cache";
import { createMediaPlayer, type MediaPlayer } from "./media-player-factory";
import {
  getHighPlaybackManifestWithTimeout,
  getPlaybackManifest,
} from "./stream.api";
import {
  selectInitialRendition,
  shouldPreferHighQuality,
} from "./mse/quality-policy";

const MSE_PREFIX = "mse:";
const STEM_SYNC_DRIFT_SEC = 0.12;
// HTMLMediaElement.HAVE_FUTURE_DATA. Keep this numeric so the client module
// remains safe when Next evaluates its import during SSR.
const STEM_READY_STATE = 3;

function isMseSong(playbackUrl: string | undefined): boolean {
  return !!playbackUrl?.startsWith(MSE_PREFIX);
}

function extractSongId(playbackUrl: string): string {
  return playbackUrl.slice(MSE_PREFIX.length);
}

function syncAudioTimeline(
  source: HTMLAudioElement,
  target: HTMLAudioElement,
): void {
  target.currentTime = source.currentTime;
}

export function useMsePlayback(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  vocalAudioRef?: React.RefObject<HTMLAudioElement | null>,
): { isMseActive: boolean; isStemActive: boolean } {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playing = usePlayerStore((s) => s.playing);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const pause = usePlayerStore((s) => s.pause);
  const playerRef = useRef<MediaPlayer | null>(null);
  const vocalPlayerRef = useRef<MediaPlayer | null>(null);
  const isStemPlaybackRef = useRef(false);
  const playerReadyRef = useRef(false);
  const stemRecoveryPendingRef = useRef(false);
  const stemRecoveryGenerationRef = useRef(0);
  const stemResumeInFlightRef = useRef(false);
  const stemPairHasStartedRef = useRef(false);
  const [isStemActive, setIsStemActive] = useState(false);

  const isMseActive = isMseSong(currentSong?.playbackUrl);

  const playbackUrl = currentSong?.playbackUrl;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl || !isMseSong(playbackUrl)) {
      if (playerRef.current) {
        playerRef.current.detach();
        playerRef.current = null;
        playerReadyRef.current = false;
      }
      vocalPlayerRef.current?.detach();
      vocalPlayerRef.current = null;
      isStemPlaybackRef.current = false;
      stemRecoveryPendingRef.current = false;
      stemResumeInFlightRef.current = false;
      stemPairHasStartedRef.current = false;
      setIsStemActive(false);
      return;
    }

    const songId = extractSongId(playbackUrl);
    if (playerRef.current) {
      playerRef.current.detach();
    }
    // A new STANDARD track can replace a SING track. Detach the old vocal
    // source before creating either new player; otherwise the previous stem
    // remains attached (and can keep playing) because only playerRef changes.
    vocalPlayerRef.current?.detach();
    vocalPlayerRef.current = null;
    isStemPlaybackRef.current = false;
    stemRecoveryPendingRef.current = false;
    stemResumeInFlightRef.current = false;
    stemPairHasStartedRef.current = false;
    stemRecoveryGenerationRef.current += 1;
    setIsStemActive(false);

    const player = createMediaPlayer();
    const vocalAudio = vocalAudioRef?.current;
    playerRef.current = player;
    playerReadyRef.current = false;

    const attach = async () => {
      const ensureCurrentPlayer = () => {
        if (playerRef.current !== player) {
          throw new DOMException("Player replaced", "AbortError");
        }
      };

      let preloaded = preloadCache.consume(songId);
      if (!preloaded) {
        await preloadCache.waitForPending(songId);
        preloaded = preloadCache.consume(songId);
      }

      if (preloaded?.mode === "SING") {
        if (!vocalAudio) throw new Error("Vocal audio element is unavailable");
        const vocalPlayer = createMediaPlayer();
        await Promise.all([
          player.attach(audio, preloaded.instrumental),
          vocalPlayer.attach(vocalAudio, preloaded.vocal),
        ]);
        if (playerRef.current !== player) {
          vocalPlayer.detach();
          throw new DOMException("Player replaced", "AbortError");
        }
        vocalPlayerRef.current = vocalPlayer;
        isStemPlaybackRef.current = true;
        setIsStemActive(true);
        return;
      }

      if (preloaded?.mode === "STANDARD") {
        setIsStemActive(false);
        await player.attach(audio, preloaded.main);
        ensureCurrentPlayer();
        return;
      }

      // Renditions are independently encoded fMP4 assets. Select one before
      // attaching MSE: live SourceBuffer replacement causes audible gaps (and
      // doubles that problem for a SING pair). Both manifest calls are tiny
      // and concurrent, so this does not serialize first-play latency.
      const highPromise = shouldPreferHighQuality()
        ? getHighPlaybackManifestWithTimeout(songId).catch(() => null)
        : Promise.resolve(null);
      const manifest = await getPlaybackManifest(songId);
      ensureCurrentPlayer();
      const selectedManifest = selectInitialRendition(
        manifest,
        await highPromise,
      );
      ensureCurrentPlayer();

      if (selectedManifest.mode === "SING") {
        if (!vocalAudio) throw new Error("Vocal audio element is unavailable");
        const vocalPlayer = createMediaPlayer();
        await Promise.all([
          player.attach(audio, undefined, {
            streamInfo: selectedManifest.instrumental,
            metadata: selectedManifest.instrumental.metadata,
          }),
          vocalPlayer.attach(vocalAudio, undefined, {
            streamInfo: selectedManifest.vocal,
            metadata: selectedManifest.vocal.metadata,
          }),
        ]);
        if (playerRef.current !== player) {
          vocalPlayer.detach();
          throw new DOMException("Player replaced", "AbortError");
        }
        vocalPlayerRef.current = vocalPlayer;
        isStemPlaybackRef.current = true;
        setIsStemActive(true);
        return;
      }

      setIsStemActive(false);
      await player.attach(audio, undefined, {
        streamInfo: selectedManifest.main,
        metadata: selectedManifest.main.metadata,
      });
      ensureCurrentPlayer();
    };

    attach()
      .then(() => {
        if (playerRef.current !== player) return;
        playerReadyRef.current = true;
        if (usePlayerStore.getState().playing) {
          const plays = [audio.play()];
          const isStemPlayback = isStemPlaybackRef.current && !!vocalAudio;
          if (isStemPlayback && vocalAudio)
            plays.push(vocalAudio.play());
          Promise.all(plays)
            .then(() => {
              if (playerRef.current === player && isStemPlayback) {
                stemPairHasStartedRef.current = true;
              }
            })
            .catch(() => pause());
        }
      })
      .catch(() => {
        if (playerRef.current === player) {
          player.detach();
          vocalPlayerRef.current?.detach();
          vocalPlayerRef.current = null;
          playerRef.current = null;
          playerReadyRef.current = false;
          pause();
        }
      });

    return () => {
      if (playerRef.current === player) {
        player.detach();
        vocalPlayerRef.current?.detach();
        vocalPlayerRef.current = null;
        isStemPlaybackRef.current = false;
        stemRecoveryPendingRef.current = false;
        stemResumeInFlightRef.current = false;
        stemPairHasStartedRef.current = false;
        setIsStemActive(false);
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, [playbackUrl, audioRef, vocalAudioRef, pause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isMseActive) return;

    if (playing) {
      // On the first tap, `playing` becomes true before MMS finishes replacing
      // the media element source. Safari aborts a play request made during that
      // replacement (AbortError), so only play after attach has completed.
      if (!playerReadyRef.current) return;

      const plays = [audio.play()];
      const vocal = vocalAudioRef?.current;
      const isStemPlayback = isStemPlaybackRef.current && !!vocal;
      if (isStemPlayback && vocal) {
        // The instrumental timeline is always the source of truth. This also
        // covers a user manually resuming while the pair was buffering.
        syncAudioTimeline(audio, vocal);
        plays.push(vocal.play());
      }
      Promise.all(plays)
        .then(() => {
          stemRecoveryPendingRef.current = false;
          if (isStemPlayback) stemPairHasStartedRef.current = true;
        })
        .catch(() => pause());
    } else {
      audio.pause();
      if (isStemPlaybackRef.current) vocalAudioRef?.current?.pause();
    }
  }, [playing, isMseActive, audioRef, vocalAudioRef, pause]);

  useEffect(() => {
    const instrumental = audioRef.current;
    const vocal = vocalAudioRef?.current;
    if (!instrumental || !vocal || !isMseActive) return;

    const alignVocalToInstrumental = () => {
      if (isStemPlaybackRef.current) {
        vocal.currentTime = instrumental.currentTime;
      }
    };
    const correctPlaybackDrift = () => {
      // The instrumental timeline is authoritative. Correct only meaningful
      // drift during steady playback so normal rendering never causes audible
      // micro-seeks.
      if (
        isStemPlaybackRef.current &&
        !instrumental.paused &&
        !vocal.paused &&
        instrumental.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        vocal.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        Math.abs(vocal.currentTime - instrumental.currentTime) >
          STEM_SYNC_DRIFT_SEC
      ) {
        alignVocalToInstrumental();
      }
    };

    instrumental.addEventListener("seeking", alignVocalToInstrumental);
    instrumental.addEventListener("seeked", alignVocalToInstrumental);
    instrumental.addEventListener("timeupdate", correctPlaybackDrift);
    return () => {
      instrumental.removeEventListener("seeking", alignVocalToInstrumental);
      instrumental.removeEventListener("seeked", alignVocalToInstrumental);
      instrumental.removeEventListener("timeupdate", correctPlaybackDrift);
    };
  }, [audioRef, vocalAudioRef, isMseActive]);

  useEffect(() => {
    const instrumental = audioRef.current;
    const vocal = vocalAudioRef?.current;
    if (!instrumental || !vocal || !isMseActive) return;

    const beginStemRecovery = () => {
      stemRecoveryPendingRef.current = true;
      stemRecoveryGenerationRef.current += 1;
      instrumental.pause();
      vocal.pause();
    };

    const pauseStemPairForBuffering = () => {
      if (
        !isStemPlaybackRef.current ||
        !stemPairHasStartedRef.current ||
        !usePlayerStore.getState().playing ||
        // Safari may emit a delayed waiting event after a stem has already
        // regained enough data. Pausing a healthy pair here leaves no later
        // event that can resume it.
        (instrumental.readyState >= STEM_READY_STATE &&
          vocal.readyState >= STEM_READY_STATE) ||
        // Seeking has its own recovery path below. Treating its transient
        // `waiting` event as a buffer stall can otherwise leave the pair
        // paused before both media elements emit `seeked`.
        instrumental.seeking ||
        vocal.seeking
      ) {
        return;
      }

      // Treat two independent MediaSource buffers as one playback unit. If
      // either stream cannot continue, neither is allowed to advance.
      beginStemRecovery();
    };

    const recoverStemPairAfterSeek = () => {
      if (
        !isStemPlaybackRef.current ||
        !stemPairHasStartedRef.current ||
        !usePlayerStore.getState().playing
      ) {
        return;
      }

      // The instrumental event starts a user seek. Pause the pair until both
      // independent MediaSources have reached the requested timeline; the
      // existing `seeked` handlers below then resume them atomically.
      beginStemRecovery();
    };

    const resumeStemPairWhenReady = () => {
      if (
        !stemRecoveryPendingRef.current ||
        stemResumeInFlightRef.current ||
        !isStemPlaybackRef.current
      ) {
        return;
      }
      if (!usePlayerStore.getState().playing) {
        stemRecoveryPendingRef.current = false;
        return;
      }
      if (
        instrumental.readyState < STEM_READY_STATE ||
        vocal.readyState < STEM_READY_STATE ||
        instrumental.seeking ||
        vocal.seeking ||
        instrumental.ended ||
        vocal.ended
      ) {
        return;
      }

      stemResumeInFlightRef.current = true;
      const recoveryGeneration = stemRecoveryGenerationRef.current;
      // A stream may have buffered at a different pace. Never resume from its
      // own clock; make it join the instrumental clock immediately before the
      // paired play request.
      vocal.currentTime = instrumental.currentTime;
      Promise.all([instrumental.play(), vocal.play()])
        .then(() => {
          if (stemRecoveryGenerationRef.current === recoveryGeneration) {
            stemRecoveryPendingRef.current = false;
          }
        })
        .catch(() => {
          if (usePlayerStore.getState().playing) pause();
        })
        .finally(() => {
          stemResumeInFlightRef.current = false;
        });
    };

    const stopOnStemError = () => {
      if (isStemPlaybackRef.current && usePlayerStore.getState().playing) {
        pause();
      }
    };

    for (const stream of [instrumental, vocal]) {
      stream.addEventListener("waiting", pauseStemPairForBuffering);
      stream.addEventListener("canplay", resumeStemPairWhenReady);
      stream.addEventListener("playing", resumeStemPairWhenReady);
      stream.addEventListener("seeked", resumeStemPairWhenReady);
      stream.addEventListener("error", stopOnStemError);
    }
    instrumental.addEventListener("seeking", recoverStemPairAfterSeek);
    return () => {
      for (const stream of [instrumental, vocal]) {
        stream.removeEventListener("waiting", pauseStemPairForBuffering);
        stream.removeEventListener("canplay", resumeStemPairWhenReady);
        stream.removeEventListener("playing", resumeStemPairWhenReady);
        stream.removeEventListener("seeked", resumeStemPairWhenReady);
        stream.removeEventListener("error", stopOnStemError);
      }
      instrumental.removeEventListener("seeking", recoverStemPairAfterSeek);
    };
  }, [audioRef, vocalAudioRef, isMseActive, pause]);

  useEffect(() => {
    if (!isMseActive || currentIndex < 0) return;

    const nextSong = queue[currentIndex + 1];
    if (!nextSong || !isMseSong(nextSong.playbackUrl)) return;
    const nextSongId = extractSongId(nextSong.playbackUrl);
    preloadCache.preload(nextSongId).catch(() => {});
    return () => preloadCache.cancelPreload(nextSongId);
  }, [currentIndex, queue, isMseActive]);

  return { isMseActive, isStemActive };
}
