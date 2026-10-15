"use client";

import {
  ElementType,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  createAmbientHlsPlayer,
  isHlsPlaybackSource,
  type AmbientHlsPlayer,
} from "../ambient-hls-player";
import AmpVolumeControl from "../AmpVolumeControl";
import PlayBackControlsSkip from "./m404-playback-controls-skip";
import AmpPlayPauseButton from "../AmpPlayPauseButton";
import PlayBackControlsFullScreen from "./m404-playback-controls-full-screen";
import AmpPlaybackControlsProgress from "../AmpPlaybackControlsProgress";
import {
  getNextQueuedSong,
  usePlayerStore,
} from "@/lib/player/use-player-store";
import { usePersistentVolume } from "@/lib/player/use-persistent-volume";
import { videoPlaybackController } from "@/lib/player/video-playback-controller";
import { useMediaQuery } from "@/hooks/use-media-query";

const CustomElement = "m404-video-played" as ElementType;

type WebKitVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
};

function toggleFullscreen(
  host: HTMLElement | null,
  video: HTMLVideoElement | null,
  preferNativeVideo: boolean,
) {
  if (preferNativeVideo && video) {
    const nativeVideo = video as WebKitVideoElement;
    if (
      typeof nativeVideo.webkitEnterFullscreen === "function" &&
      nativeVideo.webkitSupportsFullscreen !== false
    ) {
      nativeVideo.webkitEnterFullscreen();
      return;
    }
  }

  const fullscreenTarget = preferNativeVideo ? video : host;
  if (!fullscreenTarget) return;

  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }

  void fullscreenTarget.requestFullscreen?.();
}

const M404_CSS = `:host { --button-color: var(--keyColor, var(--musicKeyColor, var(--systemBlue))); --keyColor-focus-color: var(--white80, rgba(255, 255, 255, .8)); --progress-time: var(--white80, rgba(255, 255, 255, .8)); --progress-bar-grid-template-areas: "elapsed scrubber remaining"; --progress-bar-grid-template-rows: auto; --progress-bar-grid-column-gap: 10px; --progress-bar-grid-row-gap: 0; --player-controls-color-alt: var(--white80, rgba(255, 255, 255, .8)); width: 100%; height: 100%; display: grid; grid-template: "grid" 100% / 100%; overflow: hidden; position: relative; } :host video { width: inherit; height: inherit; display: block; } .video-container { width: inherit; height: inherit; max-height: var(--video-container-max-height, 100vh); display: flex; grid-area: grid; align-items: stretch; justify-content: stretch; position: relative; z-index: 1; } .video-container.hide-cursor { cursor: none; } .video-container > video { width: inherit; height: inherit; display: block; pointer-events: none; object-fit: contain; object-position: 50% 50%; } .scrim { width: 100%; height: 100%; display: grid; grid-template: ". .      ." var(--video-top-spacing, 30px) ". header ." auto ". .      ." 1fr ". info   ." auto ". footer ." auto ". .      ." var(--video-bottom-spacing, 20px)/var(--video-side-spacing, 20px) 1fr var(--video-side-spacing, 20px); grid-area: grid; position: relative; z-index: 2; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; color: rgba(255, 255, 255, 0.85); } .scrim[aria-hidden="true"] { cursor: none; } .scrim [lang]:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(bn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(gu) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(hi) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(kn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(ml) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(mr) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(or) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(pa) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(ta) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(te) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(th) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(ur) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .scrim [lang]:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .gradient { content: ""; grid-area: grid; position: absolute; z-index: 1; inset: 0px; background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5) 7%, rgba(0, 0, 0, 0) 23%, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 0.5) 82%, rgba(0, 0, 0, 0.5)); transition: opacity 100ms; pointer-events: none; } .gradient[aria-hidden="true"] { opacity: 0; } .empty-state { display: flex; align-items: center; justify-content: center; position: absolute; z-index: 2; inset: 0px; } .scrim__header { padding: 0px 10px; display: flex; grid-area: header; align-items: center; justify-content: space-between; transform: none; transition: opacity 0.4s cubic-bezier(0, 0, 0.2, 1) 0.05s, transform 0.5s cubic-bezier(0, 0, 0.2, 1); } .scrim[aria-hidden="true"] .scrim__header { transform: translateY(20px); transition: opacity 0.4s cubic-bezier(0.4, 0, 0.6, 1) 0.05s, transform 0.5s cubic-bezier(0.4, 0, 0.6, 1); opacity: 0; } .scrim__info { margin-top: auto; margin-bottom: 14px; padding: 0px 10px; grid-area: info; align-items: end; overflow-x: hidden; transform: none; transition: opacity 0.4s cubic-bezier(0, 0, 0.2, 1) 0.05s, transform 0.5s cubic-bezier(0, 0, 0.2, 1); } .scrim[aria-hidden="true"] .scrim__info { transform: translateY(20px); transition: opacity 0.4s cubic-bezier(0.4, 0, 0.6, 1) 0.05s, transform 0.5s cubic-bezier(0.4, 0, 0.6, 1); opacity: 0; } .scrim__play-control { margin: auto; grid-area: 1 / 1 / -1 / -1; position: relative; z-index: 2; color: white; transition: opacity 0.4s cubic-bezier(0, 0, 0.2, 1) 0.05s, transform 0.5s cubic-bezier(0, 0, 0.2, 1); } .scrim[aria-hidden="true"] .scrim__play-control { transition: opacity 0.4s cubic-bezier(0.4, 0, 0.6, 1) 0.05s, transform 0.5s cubic-bezier(0.4, 0, 0.6, 1); opacity: 0; } .scrim__footer { padding: 0px 10px; display: flex; grid-area: footer; flex-wrap: wrap; align-items: center; justify-content: space-between; transform: none; transition: opacity 0.4s cubic-bezier(0, 0, 0.2, 1) 0.05s, transform 0.5s cubic-bezier(0, 0, 0.2, 1); } .scrim[aria-hidden="true"] .scrim__footer { transform: translateY(20px); transition: opacity 0.4s cubic-bezier(0.4, 0, 0.6, 1) 0.05s, transform 0.5s cubic-bezier(0.4, 0, 0.6, 1); opacity: 0; } .scrim__clickable { grid-area: 1 / 1 / -3 / -1; cursor: pointer; } [aria-hidden="true"] .scrim__clickable { grid-area: 1 / 1 / -1 / -1; cursor: none; }.button-replay { margin: 0px; border: 0px; outline: none; appearance: none; font-size: 13px; line-height: 1.38462; font-weight: 400; letter-spacing: 0em; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; padding: 0px 11.5px; min-width: 68px; height: 23px; display: flex; align-items: center; justify-content: center; border-radius: 11.5px; transition: background-color 0.15s; cursor: pointer; color: var(--labelSecondary); background-color: rgb(255, 255, 255); } .button-replay:lang(bn) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(gu) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(hi) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(kn) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ml) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(mr) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(or) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(pa) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ta) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(te) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ur) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(th) { line-height: 1.64077; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-replay:active, .button-replay:focus { opacity: 0.9; } .button-replay:disabled, .button-replay[disabled] { opacity: 0.3; cursor: default; pointer-events: none; } .button-replay::before { content: ""; margin-right: 6px; width: 12px; height: 23px; display: inline-block; background-repeat: no-repeat; background-position: center center; background-size: 12px auto; } .button-replay::before { background-size: 18px auto; } .button-add { margin: 0px 0px 0px auto; border: 0px; outline: none; appearance: none; font-size: 13px; line-height: 1.38462; font-weight: 400; letter-spacing: 0em; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; padding: 0px 11.5px; min-width: 68px; height: 23px; display: flex; align-items: center; justify-content: center; border-radius: 11.5px; transition: background-color 0.15s; cursor: pointer; color: var(--labelSecondary); background-color: rgb(255, 255, 255); }.button-add:lang(bn) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(gu) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(hi) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(kn) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ml) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(mr) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(or) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(pa) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ta) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(te) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ur) { line-height: 2.07696; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(th) { line-height: 1.64077; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .button-add:active, .button-add:focus { opacity: 0.9; } .button-add:disabled, .button-add[disabled] { opacity: 0.3; cursor: default; pointer-events: none; } .button-add::before { content: ""; margin-right: 6px; width: 12px; height: 23px; display: inline-block; background-repeat: no-repeat; background-position: center center; background-size: 12px auto; } .button-add::before { background-size: 28px auto; }`;

export default function VideoPlay({
  controlsVisible,
  onActivity,
}: {
  controlsVisible: boolean;
  onActivity: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const wasVideoPlayerOpenRef = useRef(false);
  const hostRef = useRef<HTMLElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const videoPlayerOpen = usePlayerStore((state) => state.videoPlayerOpen);
  const setVideoPlayerOpen = usePlayerStore(
    (state) => state.setVideoPlayerOpen,
  );
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const pause = usePlayerStore((state) => state.pause);
  const { volume, setVolume } = usePersistentVolume();
  const usesCoarsePointer = useMediaQuery("(pointer: coarse)");
  const isMusicVideo = currentSong?.playbackKind === "video";
  const playbackUrl = isMusicVideo ? currentSong?.playbackUrl : undefined;

  const requestPlayback = () => {
    void videoPlaybackController.play().then((started) => {
      // A rejected play request is normally an autoplay-policy rejection.
      // Once media is ready, reflect that truth in the shared controls rather
      // than leaving a paused video behind a misleading Pause icon.
      const video = videoRef.current;
      if (
        !started &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        usePlayerStore.getState().pause();
      }
    });
  };

  const handleTogglePlayback = () => {
    if (usePlayerStore.getState().playing) {
      videoPlaybackController.pause();
      pause();
      return;
    }

    togglePlayback();
    // This runs in the button/canvas click itself, retaining browser user
    // activation for audible video playback.
    requestPlayback();
  };

  const skipBy = (seconds: number) => {
    videoPlaybackController.skip(seconds);
  };

  const handleToggleFullscreen = () =>
    toggleFullscreen(hostRef.current, videoRef.current, usesCoarsePointer);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;

    video.currentTime = 0;
    const detachController = videoPlaybackController.attach(video);
    const publishTime = () => {
      videoPlaybackController.publishTime(
        playbackUrl,
        video.currentTime,
        video.duration,
      );
    };
    const publishEnded = () => {
      videoPlaybackController.publishEnded(playbackUrl);
      const player = usePlayerStore.getState();
      const nextSong = getNextQueuedSong(player);
      if (!player.videoPlayerOpen || nextSong?.playbackKind === "video") {
        player.next(true);
        return;
      }

      const advanceQueue = () => usePlayerStore.getState().next(true);
      window.addEventListener("musical:video-takeover-closed", advanceQueue, {
        once: true,
      });
      player.setVideoPlayerOpen(false);
    };
    const playWhenReady = () => {
      if (usePlayerStore.getState().playing) {
        requestPlayback();
      }
    };
    const syncPause = () => {
      const player = usePlayerStore.getState();
      if (player.playing && player.currentSong?.playbackUrl === playbackUrl) {
        player.pause();
      }
    };

    video.addEventListener("timeupdate", publishTime);
    video.addEventListener("loadedmetadata", publishTime);
    video.addEventListener("ended", publishEnded);
    video.addEventListener("pause", syncPause);
    video.addEventListener("error", syncPause);

    let hlsPlayer: AmbientHlsPlayer | undefined;
    if (isHlsPlaybackSource(playbackUrl)) {
      hlsPlayer = createAmbientHlsPlayer({
        video,
        src: playbackUrl,
        profile: "hero",
        onPlayable: playWhenReady,
        onReady: publishTime,
        onFatalError: () => usePlayerStore.getState().pause(),
      });
      hlsPlayer.start();
    } else {
      video.src = playbackUrl;
      video.load();
      video.addEventListener("canplay", playWhenReady, { once: true });
    }

    return () => {
      video.removeEventListener("timeupdate", publishTime);
      video.removeEventListener("loadedmetadata", publishTime);
      video.removeEventListener("ended", publishEnded);
      video.removeEventListener("pause", syncPause);
      video.removeEventListener("error", syncPause);
      video.removeEventListener("canplay", playWhenReady);
      if (hlsPlayer) {
        hlsPlayer.destroy();
      } else {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      detachController();
    };
    // The video lives in a portal that is created after the host's Shadow DOM.
    // Re-run once that root exists; the first pass has no video ref yet.
  }, [playbackUrl, shadowRoot]);

  useEffect(() => {
    if (!playbackUrl) return;
    if (playing) {
      requestPlayback();
    } else {
      videoPlaybackController.pause();
    }
  }, [playbackUrl, playing]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let shadow = el.shadowRoot;
    if (!shadow) shadow = el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in Document.prototype &&
      "adoptedStyleSheets" in ShadowRoot.prototype
    ) {
      if (shadow.adoptedStyleSheets.length === 0) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(M404_CSS);
        shadow.adoptedStyleSheets = [sheet];
      }
    }

    setShadowRoot(shadow);
  }, []);

  useLayoutEffect(() => {
    const container = videoContainerRef.current;

    if (!container || !shadowRoot) return;

    const restoreToPlayer = () => {
      const gradient = shadowRoot.querySelector(".gradient");
      shadowRoot.insertBefore(container, gradient);
      container.removeAttribute("style");
      container.querySelector("video")?.removeAttribute("style");
    };

    const playbarMedia = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-video-playbar-media="true"]',
      ),
    ].find((element) => element.getClientRects().length > 0);

    const moveToPlaybar = () => {
      if (!playbarMedia) return;

      playbarMedia.append(container);
      Object.assign(container.style, {
        height: "100%",
        inset: "0",
        overflow: "hidden",
        position: "absolute",
        width: "100%",
      });
      const video = container.querySelector("video");
      if (video) {
        Object.assign(video.style, {
          display: "block",
          height: "100%",
          objectFit: "cover",
          width: "100%",
        });
      }
    };

    if (videoPlayerOpen || !playbarMedia) {
      wasVideoPlayerOpenRef.current = videoPlayerOpen;
      restoreToPlayer();
      return;
    }

    const shouldWaitForTakeoverClose = wasVideoPlayerOpenRef.current;
    wasVideoPlayerOpenRef.current = false;
    if (!shouldWaitForTakeoverClose) moveToPlaybar();

    const moveAfterTakeoverClose = () => moveToPlaybar();
    if (shouldWaitForTakeoverClose) {
      window.addEventListener(
        "musical:video-takeover-closed",
        moveAfterTakeoverClose,
        { once: true },
      );
    }

    const reopenVideo = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setVideoPlayerOpen(true);
    };
    playbarMedia.addEventListener("click", reopenVideo);

    return () => {
      playbarMedia.removeEventListener("click", reopenVideo);
      window.removeEventListener(
        "musical:video-takeover-closed",
        moveAfterTakeoverClose,
      );
      restoreToPlayer();
    };
  }, [setVideoPlayerOpen, shadowRoot, videoPlayerOpen]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const onToggleFullscreen = () =>
      toggleFullscreen(hostRef.current, videoRef.current, usesCoarsePointer);

    window.addEventListener(
      "musical:toggle-video-fullscreen",
      onToggleFullscreen,
    );
    return () =>
      window.removeEventListener(
        "musical:toggle-video-fullscreen",
        onToggleFullscreen,
      );
  }, [usesCoarsePointer]);

  return (
    <CustomElement ref={hostRef} hydrated>
      {shadowRoot &&
        createPortal(
          <>
            <slot name="poster"></slot>
            <div
              ref={videoContainerRef}
              className="video-container"
              id="video-container"
            >
              <video
                // A new video source gets a fresh MSE/HLS media session;
                // toggling between playbar and takeover keeps this node.
                key={playbackUrl}
                ref={videoRef}
                id="m404-music-video-player"
                title={
                  currentSong
                    ? `${currentSong.title} - ${currentSong.artist}`
                    : "Music Video"
                }
                playsInline
                preload="auto"
              ></video>
            </div>
            <div className="gradient" aria-hidden={!controlsVisible}></div>

            <div
              className="scrim"
              aria-hidden={!controlsVisible}
              onPointerDown={onActivity}
              onPointerMove={onActivity}
            >
              <div className="scrim__header">
                <slot name="header"></slot>
              </div>

              <div className="scrim__play-control">
                <slot name="play-control"></slot>
              </div>

              <div className="scrim__info">
                <slot name="info"></slot>
              </div>

              <div className="scrim__footer">
                <slot name="footer"></slot>
              </div>

              <div
                className="scrim__clickable"
                onClick={handleTogglePlayback}
              ></div>

              <slot></slot>
            </div>
          </>,
          shadowRoot,
        )}

      <div slot="info" className="info__eyebrow">
        {currentSong?.title}
      </div>
      <div slot="info" className="info__title">
        {currentSong?.artist}
      </div>

      {videoPlayerOpen && (
        <div slot="footer" className="footer__row">
          <AmpPlaybackControlsProgress
            inDetailView
            audioRef={audioRef}
            videoSource={playbackUrl}
          />
        </div>
      )}

      <div slot="footer" className="footer__row">
        <div className="footer__column">
          {!usesCoarsePointer && (
            <AmpVolumeControl volume={volume} onSetVolume={setVolume} />
          )}
        </div>

        <div className="footer__column">
          <PlayBackControlsSkip onSkip={() => skipBy(-10)} />

          <AmpPlayPauseButton
            isVideo
            mode={playing ? "pause" : "play"}
            onClick={handleTogglePlayback}
            disabled={!playbackUrl}
            containerClassName="player-internal__playback-control player-internal__playback-play"
          />

          <PlayBackControlsSkip isForward onSkip={() => skipBy(10)} />
        </div>

        <div className="footer__column">
          <PlayBackControlsFullScreen
            isFullScreen={isFullscreen}
            onToggle={handleToggleFullscreen}
          />
        </div>
      </div>

      <slot name="overlay"></slot>
    </CustomElement>
  );
}
