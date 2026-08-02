"use client";

import {
  ComponentType,
  CSSProperties,
  RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { http } from "@/lib/api/http";
import { usePlayerStore } from "@/lib/player/use-player-store";

type LyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  kind?: "LYRIC" | "INSTRUMENTAL";
};

type LyricsResponse = {
  lines: LyricLine[];
};

type LoadedLyrics = {
  songId: string;
  lines: LyricLine[];
};

type TimeSyncedLyricsDisplay = HTMLElement & {
  setLines(lines: LyricLine[]): void;
  setActiveIndex(index: number, shouldScroll?: boolean): void;
  setPlaybackTimeMs?(timeMs: number): void;
  setPlaying?(playing: boolean): void;
  focusLine(index: number): void;
  setAutoScroll(value: boolean): void;
};

const MANUAL_SCROLL_RESUME_MS = 4_000;

const APPLE_CSS = `:host { width: 100%; max-width: 300px; max-height: 100%; display: grid; box-sizing: border-box; grid-template: "header" "lyrics" 1fr; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; background-color: var(--lyricsBg); } [lang]:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(bn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(gu) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(hi) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(kn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ml) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(mr) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(or) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(pa) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ta) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(te) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(th) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ur) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__header { grid-area: header; } .lyrics__lyrics { grid-area: lyrics; overflow-y: auto; } .lyrics__lyrics.auto-scrolling { --lyrics-display-synced-line-opacity: 0; overflow-y: hidden; } .lyrics__lyrics.auto-scrolling ::-webkit-scrollbar { background: transparent; } .lyrics__loading, .lyrics__error, .lyrics__none, .lyrics__empty { font-size: 12px; line-height: 1.25; font-weight: 400; letter-spacing: 0em; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0px; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--lyrics-null-color, var(--systemSecondary)); text-align: center; } .lyrics__loading:lang(bn), .lyrics__error:lang(bn), .lyrics__none:lang(bn), .lyrics__empty:lang(bn) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(gu), .lyrics__error:lang(gu), .lyrics__none:lang(gu), .lyrics__empty:lang(gu) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(hi), .lyrics__error:lang(hi), .lyrics__none:lang(hi), .lyrics__empty:lang(hi) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(kn), .lyrics__error:lang(kn), .lyrics__none:lang(kn), .lyrics__empty:lang(kn) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ml), .lyrics__error:lang(ml), .lyrics__none:lang(ml), .lyrics__empty:lang(ml) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(mr), .lyrics__error:lang(mr), .lyrics__none:lang(mr), .lyrics__empty:lang(mr) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(or), .lyrics__error:lang(or), .lyrics__none:lang(or), .lyrics__empty:lang(or) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(pa), .lyrics__error:lang(pa), .lyrics__none:lang(pa), .lyrics__empty:lang(pa) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ta), .lyrics__error:lang(ta), .lyrics__none:lang(ta), .lyrics__empty:lang(ta) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(te), .lyrics__error:lang(te), .lyrics__none:lang(te), .lyrics__empty:lang(te) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ur), .lyrics__error:lang(ur), .lyrics__none:lang(ur), .lyrics__empty:lang(ur) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(th), .lyrics__error:lang(th), .lyrics__none:lang(th), .lyrics__empty:lang(th) { line-height: 1.48125; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ar), .lyrics__error:lang(ar), .lyrics__none:lang(ar), .lyrics__empty:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(he), .lyrics__error:lang(he), .lyrics__none:lang(he), .lyrics__empty:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ja), .lyrics__error:lang(ja), .lyrics__none:lang(ja), .lyrics__empty:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(ko), .lyrics__error:lang(ko), .lyrics__none:lang(ko), .lyrics__empty:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(zh-CN), .lyrics__error:lang(zh-CN), .lyrics__none:lang(zh-CN), .lyrics__empty:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(zh-HK), .lyrics__error:lang(zh-HK), .lyrics__none:lang(zh-HK), .lyrics__empty:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(zh-MO), .lyrics__error:lang(zh-MO), .lyrics__none:lang(zh-MO), .lyrics__empty:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__loading:lang(zh-TW), .lyrics__error:lang(zh-TW), .lyrics__none:lang(zh-TW), .lyrics__empty:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title { font-size: 12px; line-height: 1.25; font-weight: 600; letter-spacing: 0em; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(bn) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(gu) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(hi) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(kn) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ml) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(mr) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(or) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(pa) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ta) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(te) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ur) { line-height: 1.875; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(th) { line-height: 1.48125; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .lyrics__empty-title:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; }`;

function getLyricsContainer(host: HTMLElement): HTMLElement {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

  if (
    "adoptedStyleSheets" in document &&
    shadow.adoptedStyleSheets.length === 0
  ) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(APPLE_CSS);
    shadow.adoptedStyleSheets = [sheet];
  }

  let lyricsContainer = shadow.querySelector<HTMLElement>(".lyrics__lyrics");
  if (!lyricsContainer) {
    lyricsContainer = document.createElement("div");
    lyricsContainer.className = "lyrics__lyrics auto-scrolling";
    shadow.appendChild(lyricsContainer);
  }
  return lyricsContainer;
}

interface AmpLyricsProps {
  songId?: string;
  audioRef?: RefObject<HTMLAudioElement | null>;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function AmpLyrics({
  songId,
  audioRef,
  emptyTitle = "No lyrics available",
  emptyDescription = "There are no lyrics available for this song.",
}: AmpLyricsProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [loadedLyrics, setLoadedLyrics] = useState<LoadedLyrics | null>(null);
  const lines = useMemo<LyricLine[]>(() => {
    if (!loadedLyrics || loadedLyrics.songId !== songId) return [];
    return loadedLyrics.lines;
  }, [loadedLyrics, songId]);

  useEffect(() => {
    if (!songId) return;

    const controller = new AbortController();
    void http
      .get<LyricsResponse>(`/songs/${encodeURIComponent(songId)}/lyrics`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setLoadedLyrics({ songId, lines: response.data.lines });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedLyrics({ songId, lines: [] });
      });

    return () => controller.abort();
  }, [songId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const lyricsContainer = getLyricsContainer(el);

    if (lines.length) {
      let cancelled = false;
      let display: TimeSyncedLyricsDisplay | undefined;
      let resumeTimer: number | undefined;
      let animationFrame: number | undefined;
      let autoFollowEnabled = true;
      const audio = audioRef?.current;
      const isForeground = () => document.visibilityState === "visible";
      const setAutoScroll = (enabled: boolean) => {
        autoFollowEnabled = enabled;
        lyricsContainer.classList.toggle("auto-scrolling", enabled);
        display?.setAutoScroll(enabled);
      };
      const syncActiveLine = (allowFollow = isForeground()) => {
        if (!display || !audio) return;
        const timeMs = Math.floor(audio.currentTime * 1000);
        // A Custom Element constructor cannot be replaced by HMR. During a
        // dev hot reload, an already-registered older constructor can briefly
        // lack this newly added method; keep lyric rendering alive until the
        // next full page load upgrades it.
        const activeIndex = lines.findLastIndex(
          (line) => line.startTimeMs <= timeMs && line.endTimeMs > timeMs,
        );
        display.setActiveIndex(
          activeIndex,
          !audio.paused && autoFollowEnabled && allowFollow,
        );
        display.setPlaying?.(!audio.paused);
        display.setPlaybackTimeMs?.(timeMs);
      };
      const handleAudioSync = () => syncActiveLine();
      const stopFrameSync = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      };
      const startFrameSync = () => {
        stopFrameSync();
        const tick = () => {
          syncActiveLine();
          if (!audio?.paused && isForeground()) {
            animationFrame = window.requestAnimationFrame(tick);
          }
        };
        if (!audio?.paused && isForeground()) {
          animationFrame = window.requestAnimationFrame(tick);
        }
      };
      const handlePause = () => {
        stopFrameSync();
        syncActiveLine();
      };
      const handleSeek = (event: Event) => {
        const detail = (
          event as CustomEvent<{ position: number; startTimeMs: number }>
        ).detail;
        const startTimeMs = detail?.startTimeMs;
        const audio = audioRef?.current;
        if (!audio || typeof startTimeMs !== "number") return;

        const targetIndex = lines.findIndex(
          (line) => line.position === detail.position,
        );
        if (targetIndex >= 0) display?.focusLine(targetIndex);

        audio.currentTime = startTimeMs / 1000;
        if (!usePlayerStore.getState().playing) {
          usePlayerStore.getState().togglePlayback();
        }
      };
      const enableAutoScroll = () => {
        // Resume the normal visual state only. The next active line performs
        // the follow scroll, so resuming never snaps the reader unexpectedly.
        if (!autoFollowEnabled) setAutoScroll(true);
      };
      const handleManualScroll = () => {
        if (autoFollowEnabled) setAutoScroll(false);
        if (resumeTimer) window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(
          enableAutoScroll,
          MANUAL_SCROLL_RESUME_MS,
        );
      };
      const handleBackground = () => {
        stopFrameSync();
      };
      const handleForeground = () => {
        if (!isForeground()) return;

        // `timeupdate` already keeps the active line fresh while hidden.
        // Restarting the frame loop without a second forced sync prevents a
        // visible line flicker after a short app/tab switch.
        startFrameSync();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") handleForeground();
        else handleBackground();
      };
      void import("./AmpLyricsDisplayTimeSynced").then(() => {
        if (cancelled || !lyricsContainer) return;

        display = document.createElement(
          "amp-lyrics-display-time-synced",
        ) as TimeSyncedLyricsDisplay;
        display.setLines(lines);
        display.addEventListener("lyrics-line-seek", handleSeek);
        display.addEventListener("wheel", handleManualScroll, {
          passive: true,
        });
        display.addEventListener("touchmove", handleManualScroll, {
          passive: true,
        });
        lyricsContainer.replaceChildren(display);
        setAutoScroll(autoFollowEnabled);
        syncActiveLine();
        startFrameSync();
      });

      audio?.addEventListener("timeupdate", handleAudioSync);
      audio?.addEventListener("play", startFrameSync);
      audio?.addEventListener("pause", handlePause);
      audio?.addEventListener("seeked", handleAudioSync);
      audio?.addEventListener("loadedmetadata", handleAudioSync);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        cancelled = true;
        stopFrameSync();
        if (resumeTimer) window.clearTimeout(resumeTimer);
        display?.removeEventListener("lyrics-line-seek", handleSeek);
        display?.removeEventListener("wheel", handleManualScroll);
        display?.removeEventListener("touchmove", handleManualScroll);
        audio?.removeEventListener("timeupdate", handleAudioSync);
        audio?.removeEventListener("play", startFrameSync);
        audio?.removeEventListener("pause", handlePause);
        audio?.removeEventListener("seeked", handleAudioSync);
        audio?.removeEventListener("loadedmetadata", handleAudioSync);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      };
    }

    const lyricsEmpty = document.createElement("div");
    lyricsEmpty.className = "lyrics__empty";

    const titlePara = document.createElement("p");
    titlePara.className = "lyrics__empty-title";
    titlePara.textContent = emptyTitle;

    const descPara = document.createElement("p");
    descPara.textContent = emptyDescription;

    lyricsEmpty.appendChild(titlePara);
    lyricsEmpty.appendChild(descPara);
    lyricsContainer.replaceChildren(lyricsEmpty);
  }, [audioRef, emptyDescription, emptyTitle, lines]);

  const AmpLyricsTag = "amp-lyrics" as unknown as ComponentType<{
    ref: RefObject<HTMLElement | null>;
    "offset-ratio": string;
    "static-lyrics": string;
    "show-translation": string;
    "show-pronunciation": string;
    "enable-translations": string;
    class: string;
    hydrated?: string;
    style?: CSSProperties;
  }>;

  return (
    <AmpLyricsTag
      ref={containerRef}
      offset-ratio="0.15"
      static-lyrics="false"
      show-translation="false"
      show-pronunciation="false"
      enable-translations="true"
      class="bg-transparent h-[calc(100vh-54px)]"
      hydrated=""
      style={{ "--inactive-gaussian-blur": "1.36px" } as CSSProperties}
    />
  );
}
