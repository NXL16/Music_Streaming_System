"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/player.store";

const CHUNK_SIZE = 131072; // 128KB — khớp với edge worker
const MIME_TYPE = 'audio/mp4; codecs="mp4a.40.2"';
const BUFFER_AHEAD_SECONDS = 30; // fetch trước 30 giây

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const chunkIndexRef = useRef(0);
  const fileSizeRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const pendingChunksRef = useRef<ArrayBuffer[]>([]);
  const streamUrlRef = useRef<string | null>(null);

  const { streamUrl, isPlaying, volume, setProgress, setDuration, togglePlay } =
    usePlayerStore();

  // ── Append chunk pending vào SourceBuffer ──────────────────────────────────
  const appendNextPending = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || pendingChunksRef.current.length === 0) return;
    const chunk = pendingChunksRef.current.shift()!;
    try {
      sb.appendBuffer(chunk);
    } catch (err) {
      console.error("appendBuffer failed:", err);
    }
  }, []);

  // ── Kết thúc stream khi đã fetch hết file ─────────────────────────────────
  const tryEndOfStream = useCallback(() => {
    const ms = mediaSourceRef.current;
    const sb = sourceBufferRef.current;
    if (
      ms &&
      ms.readyState === "open" &&
      sb &&
      !sb.updating &&
      fileSizeRef.current !== null &&
      chunkIndexRef.current * CHUNK_SIZE >= fileSizeRef.current
    ) {
      try {
        ms.endOfStream();
      } catch (err) {
        console.error("endOfStream failed:", err);
      }
    }
  }, []);

  // ── Fetch 1 chunk theo index ───────────────────────────────────────────────
  const fetchChunk = useCallback(
    async (url: string, chunkIndex: number) => {
      if (isFetchingRef.current) return;

      // Đã vượt quá fileSize → endOfStream
      if (
        fileSizeRef.current !== null &&
        chunkIndex * CHUNK_SIZE >= fileSizeRef.current
      ) {
        tryEndOfStream();
        return;
      }

      isFetchingRef.current = true;

      const start = chunkIndex * CHUNK_SIZE;
      const end = start + CHUNK_SIZE - 1;

      try {
        const res = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
        });

        if (!res.ok && res.status !== 206) {
          console.error(`Fetch chunk ${chunkIndex} failed: ${res.status}`);
          return;
        }

        // Lấy fileSize từ Content-Range lần đầu
        if (fileSizeRef.current === null) {
          const contentRange = res.headers.get("Content-Range");
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/);
            if (match) fileSizeRef.current = parseInt(match[1], 10);
          }
        }

        const buffer = await res.arrayBuffer();
        pendingChunksRef.current.push(buffer);
        chunkIndexRef.current = chunkIndex + 1;
        appendNextPending();
      } catch (err) {
        console.error(`Fetch chunk ${chunkIndex} error:`, err);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [appendNextPending, tryEndOfStream],
  );

  // ── Kiểm tra có cần fetch thêm không ─────────────────────────────────────
  const maybeFetchMore = useCallback(() => {
    const audio = audioRef.current;
    const sb = sourceBufferRef.current;
    const url = streamUrlRef.current;

    if (!audio || !sb || !url || isFetchingRef.current) return;

    const bufferedEnd = sb.buffered.length > 0 ? sb.buffered.end(0) : 0;
    const currentTime = audio.currentTime;

    if (bufferedEnd - currentTime < BUFFER_AHEAD_SECONDS) {
      fetchChunk(url, chunkIndexRef.current);
    }
  }, [fetchChunk]);

  // ── Khởi tạo MediaSource khi streamUrl thay đổi ───────────────────────────
  useEffect(() => {
    if (!streamUrl) return;

    streamUrlRef.current = streamUrl;

    // Reset state
    chunkIndexRef.current = 0;
    fileSizeRef.current = null;
    isFetchingRef.current = false;
    pendingChunksRef.current = [];

    // Tạo Audio element nếu chưa có
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.pause();

    // Cleanup MediaSource cũ
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === "open") {
          mediaSourceRef.current.endOfStream();
        }
      } catch {}
      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
    }

    // Tạo MediaSource mới
    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    const objectUrl = URL.createObjectURL(ms);
    audio.src = objectUrl;

    const onSourceOpen = () => {
      if (!MediaSource.isTypeSupported(MIME_TYPE)) {
        console.error("MIME type not supported:", MIME_TYPE);
        return;
      }

      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer(MIME_TYPE);
      } catch (err) {
        console.error("addSourceBuffer failed:", err);
        return;
      }
      sourceBufferRef.current = sb;

      sb.addEventListener("updateend", () => {
        appendNextPending();
        maybeFetchMore();
        tryEndOfStream();
      });

      // Fetch chunk đầu tiên
      fetchChunk(streamUrl, 0);
    };

    ms.addEventListener("sourceopen", onSourceOpen, { once: true });

    return () => {
      URL.revokeObjectURL(objectUrl);
      streamUrlRef.current = null;
      ms.removeEventListener("sourceopen", onSourceOpen);
      try {
        if (ms.readyState === "open") ms.endOfStream();
      } catch {}
      audio.src = "";
      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
    };
  }, [
    streamUrl,
    fetchChunk,
    appendNextPending,
    maybeFetchMore,
    tryEndOfStream,
  ]);

  // ── Play / Pause ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !streamUrl) return;

    if (isPlaying) {
      if (audio.readyState >= 3) {
        audio.play().catch(console.error);
      } else {
        const onCanPlay = () => audio.play().catch(console.error);
        audio.addEventListener("canplay", onCanPlay, { once: true });
        return () => audio.removeEventListener("canplay", onCanPlay);
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, streamUrl]);

  // ── Volume ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // ── Progress + Duration + buffer monitoring ───────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      maybeFetchMore();
    };

    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => togglePlay();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [setProgress, setDuration, togglePlay, maybeFetchMore]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  const seek = useCallback(
    (percent: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.duration || !isFinite(audio.duration)) return;

      const targetTime = (percent / 100) * audio.duration;
      if (!isFinite(targetTime)) return;

      // Tính chunk chứa targetTime
      const url = streamUrlRef.current;
      if (url && fileSizeRef.current) {
        const bytesPerSecond = fileSizeRef.current / audio.duration;
        const targetByte = targetTime * bytesPerSecond;
        const targetChunk = Math.floor(targetByte / CHUNK_SIZE);

        // Reset fetch state về chunk mới
        chunkIndexRef.current = targetChunk;
        isFetchingRef.current = false;
        pendingChunksRef.current = [];

        // Fetch chunk tại vị trí seek
        fetchChunk(url, targetChunk);
      }

      try {
        audio.currentTime = targetTime;
      } catch (err) {
        console.error("seek failed:", err);
      }
      setProgress(percent);
    },
    [setProgress, fetchChunk],
  );

  return { seek };
}
