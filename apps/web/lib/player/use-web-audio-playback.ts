"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore, type PlayerSong } from "./use-player-store";
import { acquirePlaybackAudioSession } from "./audio-session";
import { WebAudioTransport } from "./web-audio/web-audio-transport";
import {
  getPlaybackManifest,
  getHighPlaybackManifestWithTimeout,
} from "./stream.api";
import {
  selectInitialRendition,
  shouldPreferHighQuality,
} from "./web-audio/quality-policy";

function key(song: PlayerSong | null): string {
  return song
    ? `${song.id}:${song.releaseTrackId ?? ""}:${song.playbackKind ?? "audio"}:${song.video?.id ?? ""}:${song.playbackUrl ?? ""}`
    : "";
}

export function useWebAudioPlayback(
  volume: number,
  vocalVolume: number,
): {
  transport: WebAudioTransport | null;
  active: boolean;
  isStemActive: boolean;
} {
  const song = usePlayerStore((state) => state.currentSong);
  const active = song?.playbackKind !== "video" && !!song?.playbackUrl;
  const sessionKey = key(song);
  const [published, setPublished] = useState<{
    key: string;
    revision: number;
    transport: WebAudioTransport;
  } | null>(null);
  const [isStemActive, setIsStemActive] = useState(false);
  const [revision, setRevision] = useState(0);
  const sessionRef = useRef<{
    dispose: () => void;
    transport: WebAudioTransport;
  } | null>(null);
  const retryRef = useRef<{ key: string; time: number } | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const releaseAudioSessionRef = useRef<(() => void) | null>(null);
  const levels = useRef({ volume, vocalVolume });
  const play = useCallback(() => {
    const audio = sessionRef.current?.transport;
    if (audio) void audio.play().catch(audio.fail);
  }, []);

  useEffect(() => {
    levels.current = { volume, vocalVolume };
    if (sessionRef.current) {
      sessionRef.current.transport.volume = volume;
      sessionRef.current.transport.setVocalVolume(vocalVolume);
    }
  }, [volume, vocalVolume]);

  useEffect(
    () =>
      usePlayerStore.subscribe((state, previous) => {
        if (key(state.currentSong) !== key(previous.currentSong)) {
          const hadSession =
            sessionRef.current !== null || retryRef.current !== null;
          sessionRef.current?.dispose();
          retryRef.current = null;
          if (hadSession) setRevision((value) => value + 1);
        }
        if (state.playing !== previous.playing) {
          if (!state.playing) sessionRef.current?.transport.pause();
          else if (retryRef.current?.key === key(state.currentSong))
            setRevision((value) => value + 1);
          else play();
        }
        if (
          state.playbackRate !== previous.playbackRate &&
          sessionRef.current
        ) {
          sessionRef.current.transport.playbackRate = state.playbackRate;
        }
      }),
    [play],
  );

  useEffect(() => {
    if (!active || !song?.playbackUrl) return;
    const songId = song.id;
    const controller = new AbortController();
    let alive = true;
    const current = () =>
      alive && key(usePlayerStore.getState().currentSong) === sessionKey;
    const initialTime =
      retryRef.current?.key === sessionKey ? retryRef.current.time : 0;
    retryRef.current = null;
    const audio = new WebAudioTransport((reason) => {
      if (!current()) return;
      if (
        !(reason instanceof DOMException && reason.name === "NotAllowedError")
      ) {
        retryRef.current = { key: sessionKey, time: audio.currentTime };
        controller.abort();
      }
      usePlayerStore.getState().pause();
    });
    audio.currentTime = initialTime;
    audio.volume = levels.current.volume;
    audio.setVocalVolume(levels.current.vocalVolume);
    audio.playbackRate = usePlayerStore.getState().playbackRate;
    const dispose = () => {
      alive = false;
      controller.abort();
      audio.dispose();
      if (sessionRef.current?.transport === audio) sessionRef.current = null;
    };
    sessionRef.current = { transport: audio, dispose };
    queueMicrotask(() => {
      if (!current()) return;
      setPublished({ key: sessionKey, revision, transport: audio });
      setIsStemActive(false);
    });

    void (async () => {
      const high = shouldPreferHighQuality()
        ? getHighPlaybackManifestWithTimeout(songId, controller.signal).catch(
            () => null,
          )
        : Promise.resolve(null);
      const manifest = selectInitialRendition(
        await getPlaybackManifest(songId, controller.signal),
        await high,
      );
      if (!current()) return;
      let context = contextRef.current;
      if (context?.state === "closed") {
        contextRef.current = null;
        releaseAudioSessionRef.current?.();
        releaseAudioSessionRef.current = null;
        context = null;
      }
      if (!current()) return;
      if (!context) {
        const releaseSession = acquirePlaybackAudioSession();
        try {
          context = new AudioContext({ latencyHint: "playback" });
        } catch (error) {
          releaseSession();
          throw error;
        }
        contextRef.current = context;
        releaseAudioSessionRef.current = releaseSession;
      }
      const { WebAudioPlayer } = await import("./web-audio/web-audio-player");
      if (!current()) return;
      const engine = new WebAudioPlayer(context, audio.update, audio.fail);
      audio.own(engine);
      const loadedTime = audio.currentTime;
      await engine.load(manifest, loadedTime);
      if (!current()) {
        engine.dispose();
        return;
      }
      setIsStemActive(manifest.mode === "SING");
      audio.bind(
        engine,
        manifest.mode === "SING" ? "stem" : "standard",
        loadedTime,
      );
      if (usePlayerStore.getState().playing) play();
    })().catch((reason: unknown) => {
      if (current()) audio.fail(reason);
    });

    return dispose;
  }, [active, sessionKey, song?.id, song?.playbackUrl, revision, play]);

  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      releaseAudioSessionRef.current?.();
      releaseAudioSessionRef.current = null;
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  useEffect(() => {
    const recover = () => {
      if (document.hidden || !usePlayerStore.getState().playing) return;
      play();
    };
    window.addEventListener("pageshow", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener("pageshow", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [play]);

  const transport =
    active && published?.key === sessionKey && published.revision === revision
      ? published.transport
      : null;
  return { transport, active, isStemActive: !!transport && isStemActive };
}
