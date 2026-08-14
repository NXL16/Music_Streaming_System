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
import { usePlayerStore } from "@/lib/player/use-player-store";
import { getSongLyrics, type LyricLine } from "@/lib/lyrics/song-lyrics.api";

type LoadedLyrics = {
  songId: string;
  lines: LyricLine[];
};

type LyricsLoadStatus = "pending" | "loading" | "ready";

type TimeSyncedLyricsDisplay = HTMLElement & {
  setLines(lines: LyricLine[]): void;
  setActiveLineTopRatio(value: number): void;
  setActiveIndex(index: number, shouldScroll?: boolean): void;
  setPlaybackTimeMs?(timeMs: number): void;
  setPlaying?(playing: boolean): void;
  focusLine(index: number, behavior?: ScrollBehavior): void;
  setAutoScroll(value: boolean): void;
};

const MANUAL_SCROLL_RESUME_MS = 4_000;
const LINE_SEEK_SCROLL_LOCK_MS = 450;
const LINE_SEEK_MAX_WAIT_MS = 1_500;
const LOADING_DELAY_MS = 160;
const MIN_LOADING_VISIBLE_MS = 200;

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
  inDetailView?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function AmpLyrics({
  songId,
  audioRef,
  inDetailView,
  emptyTitle = "No lyrics available",
  emptyDescription = "There are no lyrics available for this song.",
}: AmpLyricsProps) {
  const containerRef = useRef<HTMLElement>(null);
  const activeLineTopRatio = inDetailView ? 0.32 : 0.18;
  const [loadedLyrics, setLoadedLyrics] = useState<LoadedLyrics | null>(null);
  const [lyricsLoadStatus, setLyricsLoadStatus] = useState<{
    songId?: string;
    status: LyricsLoadStatus;
  }>({ status: "pending" });
  const lines = useMemo<LyricLine[]>(() => {
    if (!loadedLyrics || loadedLyrics.songId !== songId) return [];
    return loadedLyrics.lines;
  }, [loadedLyrics, songId]);

  useEffect(() => {
    if (!songId) return;

    let cancelled = false;
    let loadingVisibleAt: number | undefined;
    let loadingTimer: number | undefined;
    let settleTimer: number | undefined;

    loadingTimer = window.setTimeout(() => {
      loadingTimer = undefined;
      loadingVisibleAt = performance.now();
      setLyricsLoadStatus({ songId, status: "loading" });
    }, LOADING_DELAY_MS);

    const resolveLyrics = (lines: LyricLine[]) => {
      if (loadingTimer) {
        window.clearTimeout(loadingTimer);
        loadingTimer = undefined;
      }

      const commit = () => {
        if (cancelled) return;
        setLoadedLyrics({ songId, lines });
        setLyricsLoadStatus({ songId, status: "ready" });
      };

      const remainingVisibleTime = loadingVisibleAt
        ? Math.max(
            0,
            loadingVisibleAt + MIN_LOADING_VISIBLE_MS - performance.now(),
          )
        : 0;
      if (remainingVisibleTime > 0) {
        settleTimer = window.setTimeout(commit, remainingVisibleTime);
      } else {
        commit();
      }
    };

    void getSongLyrics(songId)
      .then((lines) => {
        resolveLyrics(lines);
      })
      .catch(() => {
        resolveLyrics([]);
      });

    return () => {
      cancelled = true;
      if (loadingTimer) window.clearTimeout(loadingTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [songId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const lyricsContainer = getLyricsContainer(el);
    const status = songId
      ? lyricsLoadStatus.songId === songId
        ? lyricsLoadStatus.status
        : "pending"
      : "ready";

    const renderMessage = (
      className: "lyrics__loading" | "lyrics__empty",
      title: string,
      description?: string,
      emphasizeTitle = true,
    ) => {
      const message = document.createElement("div");
      message.className = className;

      const titlePara = document.createElement("p");
      if (emphasizeTitle) titlePara.className = "lyrics__empty-title";
      titlePara.textContent = title;
      message.appendChild(titlePara);

      if (description) {
        const descriptionPara = document.createElement("p");
        descriptionPara.textContent = description;
        message.appendChild(descriptionPara);
      }

      lyricsContainer.replaceChildren(message);
    };

    if (status === "pending") {
      lyricsContainer.replaceChildren();
      return;
    }

    if (status === "loading") {
      renderMessage("lyrics__loading", "Loading lyrics…", undefined, false);
      return;
    }

    if (lines.length) {
      let cancelled = false;
      let display: TimeSyncedLyricsDisplay | undefined;
      let resumeTimer: number | undefined;
      let animationFrame: number | undefined;
      let autoFollowEnabled = true;
      let resumeAutoScrollOnNextLine = false;
      let activeLineIndex = -1;
      let isInitialSync = true;
      let isAudioSeeking = false;
      let manualScrollVersion = 0;
      let pendingSeekScrollVersion: number | undefined;
      let isLineSeekInProgress = false;
      let lineSeekScrollLockUntil = 0;
      let lineSeekScrollLockTimer: number | undefined;
      const audio = audioRef?.current;
      const setAutoScroll = (enabled: boolean, hidePastLines = enabled) => {
        autoFollowEnabled = enabled;
        lyricsContainer.classList.toggle("auto-scrolling", hidePastLines);
        display?.setAutoScroll(enabled);
      };
      const syncActiveLine = (shouldScroll = true) => {
        if (!display || !audio) return;
        const playerState = usePlayerStore.getState();
        const timeMs =
          playerState.currentSong?.id === songId
            ? playerState.playbackTimeMs
            : 0;
        const activeIndex = lines.findLastIndex(
          (line) => line.startTimeMs <= timeMs && line.endTimeMs > timeMs,
        );
        const lineChanged = activeIndex !== activeLineIndex;
        if (
          resumeAutoScrollOnNextLine &&
          !audio.paused &&
          activeIndex >= 0 &&
          lineChanged
        ) {
          setAutoScroll(true);
          resumeAutoScrollOnNextLine = false;
        }
        display.setActiveIndex(
          activeIndex,
          shouldScroll &&
            !isAudioSeeking &&
            !isInitialSync &&
            !audio.paused &&
            autoFollowEnabled,
        );
        activeLineIndex = activeIndex;
        display.setPlaying?.(
          playerState.currentSong?.id === songId && playerState.playing,
        );
        display.setPlaybackTimeMs?.(timeMs);

        if (isInitialSync && activeIndex >= 0) {
          display.focusLine(activeIndex, "auto");
          isInitialSync = false;
        }
      };
      const handleAudioSync = () => syncActiveLine();
      const handleAudioSeeking = () => {
        isAudioSeeking = true;
        pendingSeekScrollVersion ??= manualScrollVersion;
      };
      const handleAudioSeeked = () => {
        isAudioSeeking = false;
        const shouldFocusLine =
          (pendingSeekScrollVersion ?? manualScrollVersion) ===
          manualScrollVersion;
        pendingSeekScrollVersion = undefined;
        syncActiveLine(false);
        if (shouldFocusLine && activeLineIndex >= 0) {
          display?.focusLine(activeLineIndex);
        }
        if (isLineSeekInProgress) {
          isLineSeekInProgress = false;
          lineSeekScrollLockUntil =
            performance.now() + LINE_SEEK_SCROLL_LOCK_MS;
          if (lineSeekScrollLockTimer) {
            window.clearTimeout(lineSeekScrollLockTimer);
          }
          lineSeekScrollLockTimer = window.setTimeout(() => {
            lineSeekScrollLockUntil = 0;
            lineSeekScrollLockTimer = undefined;
          }, LINE_SEEK_SCROLL_LOCK_MS);
        }
      };
      const stopFrameSync = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      };
      const startFrameSync = () => {
        stopFrameSync();
        const tick = () => {
          syncActiveLine();
          if (!audio?.paused) {
            animationFrame = window.requestAnimationFrame(tick);
          }
        };
        if (!audio?.paused) {
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
        if (targetIndex < 0) return;

        isAudioSeeking = true;
        pendingSeekScrollVersion = manualScrollVersion;
        isLineSeekInProgress = true;
        lineSeekScrollLockUntil = performance.now() + LINE_SEEK_MAX_WAIT_MS;
        if (lineSeekScrollLockTimer) {
          window.clearTimeout(lineSeekScrollLockTimer);
        }
        lineSeekScrollLockTimer = window.setTimeout(() => {
          isAudioSeeking = false;
          pendingSeekScrollVersion = undefined;
          isLineSeekInProgress = false;
          lineSeekScrollLockUntil = 0;
          lineSeekScrollLockTimer = undefined;
        }, LINE_SEEK_MAX_WAIT_MS);
        audio.currentTime = startTimeMs / 1000;
        if (!usePlayerStore.getState().playing) {
          usePlayerStore.getState().togglePlayback();
        }
      };
      const enableAutoScroll = () => {
        if (!autoFollowEnabled) {
          setAutoScroll(true, false);
          resumeAutoScrollOnNextLine = true;
        }
      };
      const handleManualScroll = (event: Event) => {
        if (performance.now() < lineSeekScrollLockUntil) {
          event.preventDefault();
          return;
        }
        manualScrollVersion += 1;
        if (autoFollowEnabled) setAutoScroll(false);
        resumeAutoScrollOnNextLine = false;
        if (resumeTimer) window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(
          enableAutoScroll,
          MANUAL_SCROLL_RESUME_MS,
        );
      };
      void import("./AmpLyricsDisplayTimeSynced").then(() => {
        if (cancelled || !lyricsContainer) return;

        display = document.createElement(
          "amp-lyrics-display-time-synced",
        ) as TimeSyncedLyricsDisplay;
        display.setLines(lines);
        display.setActiveLineTopRatio(activeLineTopRatio);
        display.addEventListener("lyrics-line-seek", handleSeek);
        display.addEventListener("wheel", handleManualScroll, {
          capture: true,
          passive: false,
        });
        display.addEventListener("touchmove", handleManualScroll, {
          capture: true,
          passive: false,
        });
        lyricsContainer.replaceChildren(display);
        setAutoScroll(autoFollowEnabled);
        requestAnimationFrame(() => {
          if (cancelled) return;

          syncActiveLine();
          startFrameSync();
        });
      });

      audio?.addEventListener("timeupdate", handleAudioSync);
      audio?.addEventListener("play", startFrameSync);
      audio?.addEventListener("pause", handlePause);
      audio?.addEventListener("seeking", handleAudioSeeking);
      audio?.addEventListener("seeked", handleAudioSeeked);
      audio?.addEventListener("loadedmetadata", handleAudioSync);

      return () => {
        cancelled = true;
        stopFrameSync();
        if (resumeTimer) window.clearTimeout(resumeTimer);
        if (lineSeekScrollLockTimer) {
          window.clearTimeout(lineSeekScrollLockTimer);
        }
        display?.removeEventListener("lyrics-line-seek", handleSeek);
        display?.removeEventListener("wheel", handleManualScroll, true);
        display?.removeEventListener("touchmove", handleManualScroll, true);
        audio?.removeEventListener("timeupdate", handleAudioSync);
        audio?.removeEventListener("play", startFrameSync);
        audio?.removeEventListener("pause", handlePause);
        audio?.removeEventListener("seeking", handleAudioSeeking);
        audio?.removeEventListener("seeked", handleAudioSeeked);
        audio?.removeEventListener("loadedmetadata", handleAudioSync);
      };
    }

    renderMessage("lyrics__empty", emptyTitle, emptyDescription);
  }, [
    activeLineTopRatio,
    audioRef,
    emptyDescription,
    emptyTitle,
    inDetailView,
    lines,
    lyricsLoadStatus,
    songId,
  ]);

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
      hydrated=""
      ref={containerRef}
      offset-ratio={`${activeLineTopRatio}`}
      static-lyrics="false"
      show-translation="false"
      show-pronunciation="false"
      enable-translations="true"
      class={`${inDetailView ? "[--gradient-color-override:255] [--line-animation-play-state:running] bg-transparent h-[80%] max-w-none" : "bg-transparent h-[calc(100vh-54px)]"}`}
      style={{ "--inactive-gaussian-blur": "1.36px" } as CSSProperties}
    />
  );
}
