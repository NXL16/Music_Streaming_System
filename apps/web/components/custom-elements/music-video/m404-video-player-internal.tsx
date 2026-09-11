"use client";

import {
  type ElementType,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createAmbientHlsPlayer,
  isHlsPlaybackSource,
  type AmbientHlsPlayer,
} from "../ambient-hls-player";
import type { MusicVideoSource } from "./music-video-player";
import M404VideoKeyboardControls from "./m404-video-keyboard-controls";
import M404VideoPlayer, { type VideoPlaybackStatus } from "./m404-video-player";
import { useVideoFramePreview } from "./use-video-frame-preview";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { videoPlaybackController } from "@/lib/player/video-playback-controller";

const InternalTag = "amp-video-player-internal" as ElementType;
const CONTROLS_IDLE_DELAY_MS = 2_500;

type Props = {
  source: MusicVideoSource;
  open: boolean;
  previewEnabled: boolean;
  isPlaybarReady: boolean;
  onClose: () => void;
  onControlsChange: (visible: boolean) => void;
};

export default function M404VideoPlayerInternal({
  source,
  open,
  previewEnabled,
  isPlaybarReady,
  onClose,
  onControlsChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoMountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const hlsRef = useRef<AmbientHlsPlayer | null>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsVisibleRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<VideoPlaybackStatus>("loading");
  const playerPlaying = usePlayerStore((state) => state.playing);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const setPlaybackTimeMs = usePlayerStore((state) => state.setPlaybackTimeMs);
  const pausePlayer = usePlayerStore((state) => state.pause);
  const next = usePlayerStore((state) => state.next);
  const {
    image: previewImage,
    previewAt,
    videoRef: previewVideoRef,
  } = useVideoFramePreview(source.src, attempt, previewEnabled);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openRef.current = open;
    if (!open) return;

    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration);
  }, [open]);

  useLayoutEffect(() => {
    const video = document.createElement("video");
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("disableRemotePlayback", "");
    videoRef.current = video;
    return () => {
      if (videoRef.current === video) videoRef.current = null;
      video.remove();
    };
  }, []);

  const setControls = useCallback(
    (visible: boolean) => {
      if (controlsVisibleRef.current === visible) return;
      controlsVisibleRef.current = visible;
      setControlsVisible(visible);
      onControlsChange(visible);
    },
    [onControlsChange],
  );
  const revealControls = useCallback(() => {
    setControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (videoRef.current && !videoRef.current.paused) {
      controlsTimerRef.current = setTimeout(() => {
        controlsTimerRef.current = null;
        setControls(false);
      }, CONTROLS_IDLE_DELAY_MS);
    }
  }, [setControls]);

  useEffect(
    () => () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const detachVideo = videoPlaybackController.attach(video);

    setStatus("loading");
    setCurrentTime(0);
    setDuration(0);

    const playIfRequested = () => {
      if (!usePlayerStore.getState().playing) return;
      // Source replacement and HLS attachment can transiently abort an early
      // play request. Keep the user's Play intent and retry on `canplay`.
      void video.play().catch(() => undefined);
    };

    const syncTime = () => {
      // The shared player bar gets its position imperatively. Keeping modal
      // state in sync while it is closed only creates needless React renders.
      if (openRef.current) {
        setCurrentTime(video.currentTime);
        setDuration(video.duration);
      }
      setPlaybackTimeMs(Math.max(0, Math.round(video.currentTime * 1000)));
      videoPlaybackController.publishTime(
        source.src,
        video.currentTime,
        video.duration,
      );
    };
    const onPlay = () => {
      setStatus("ready");
      revealControls();
    };
    const onPause = () => {
      if (usePlayerStore.getState().playing) pausePlayer();
      setControls(true);
    };
    const onError = () => {
      setStatus("error");
      pausePlayer();
    };
    const onEnded = () => {
      videoPlaybackController.publishEnded(source.src);
      if (!next(true)) onCloseRef.current();
    };

    video.addEventListener("loadedmetadata", syncTime);
    video.addEventListener("canplay", playIfRequested);
    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    if (isHlsPlaybackSource(source.src)) {
      hlsRef.current = createAmbientHlsPlayer({
        video,
        src: source.src,
        profile: "hero",
        onPlayable: playIfRequested,
        onReady: () => {
          syncTime();
          setStatus("ready");
        },
        onFatalError: () => {
          setStatus("error");
          pausePlayer();
        },
      });
      hlsRef.current.start();
    } else {
      video.src = source.src;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeEventListener("loadedmetadata", syncTime);
      video.removeEventListener("canplay", playIfRequested);
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      video.pause();
      video.removeAttribute("src");
      video.load();
      detachVideo();
    };
  }, [
    attempt,
    next,
    pausePlayer,
    revealControls,
    setControls,
    setPlaybackTimeMs,
    source.src,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playerPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [playerPlaying, source.src]);

  useEffect(() => {
    videoPlaybackController.setPlaybackRate(playbackRate);
  }, [playbackRate, source.src]);

  const toggle = useCallback(() => {
    if (status === "error") return;
    usePlayerStore.getState().togglePlayback();
    revealControls();
  }, [revealControls, status]);
  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      const nextTime = Math.max(0, Math.min(video.duration, time));
      setCurrentTime(nextTime);
      video.currentTime = nextTime;
      revealControls();
    },
    [revealControls],
  );
  const skip = useCallback(
    (seconds: number) => seek((videoRef.current?.currentTime || 0) + seconds),
    [seek],
  );
  const fullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }, []);
  const isInPlaybar = !open && isPlaybarReady;

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let frame: number | undefined;
    const mountVideo = () => {
      const target = isInPlaybar
        ? document.querySelector<HTMLElement>(
            "[data-video-playbar-media='true']",
          )
        : videoMountRef.current;
      if (!target) {
        frame = requestAnimationFrame(mountVideo);
        return;
      }
      video.className = isInPlaybar
        ? "size-full rounded-[inherit] object-cover"
        : "size-full object-contain";
      video.poster = source.poster ?? "";
      if (video.parentElement !== target) target.append(video);
    };

    mountVideo();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isInPlaybar, source.poster]);

  return (
    <InternalTag
      ref={containerRef}
      className={open ? "absolute inset-0 block" : "pointer-events-none hidden"}
      hydrated=""
    >
      <video
        ref={previewVideoRef}
        className="pointer-events-none absolute size-px opacity-0"
        muted
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        aria-hidden="true"
      />
      <M404VideoPlayer
        controlsVisible={controlsVisible}
        currentTime={currentTime}
        duration={duration}
        onActivity={revealControls}
        onFullscreen={fullscreen}
        onPreview={previewAt}
        onRetry={() => setAttempt((value) => value + 1)}
        onSeek={seek}
        onSkip={skip}
        onToggle={toggle}
        playing={playerPlaying}
        previewImage={previewImage}
        source={source}
        status={status}
        mediaMountRef={videoMountRef}
      />
      <M404VideoKeyboardControls
        enabled={open}
        onActivity={revealControls}
        onClose={onClose}
        onFullscreen={fullscreen}
        onSeek={skip}
        onToggle={toggle}
      />
    </InternalTag>
  );
}
