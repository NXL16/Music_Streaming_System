"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { http } from "@/lib/api/http";
import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import type { PlayerSong } from "@/lib/player/use-player-store";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { listMySongs } from "@/lib/songs/song.api";
import type { SongSummary } from "@/lib/songs/song.types";

type LineKind = "LYRIC" | "INSTRUMENTAL";
type Line = {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  kind: LineKind;
};
type LyricsDocument = {
  plainText: string;
  published: boolean;
  lines: Array<{
    text: string;
    startTimeMs: number;
    endTimeMs: number;
    kind?: LineKind;
  }>;
};

const STORAGE_PREFIX = "lyrics-line-editor:";
const LAST_SONG_STORAGE_KEY = "lyrics-line-editor:last-song-id";
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25] as const;
const formatTime = (value: number) =>
  `${Math.floor(value / 60_000)}:${((value % 60_000) / 1_000).toFixed(2).padStart(5, "0")}`;
const isTimed = (line: Line) =>
  line.startTimeMs >= 0 && line.endTimeMs > line.startTimeMs;
const newLine = (kind: LineKind): Line => ({
  kind,
  text: kind === "LYRIC" ? "Dòng lyric mới" : "",
  startTimeMs: -1,
  endTimeMs: -1,
});

function fallbackPlayerSong(song: SongSummary): PlayerSong {
  const artworkUrl = song.coverUrl || "/assets/artwork/1x1.gif";
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artists: song.artist ? [{ name: song.artist }] : [],
    album: song.album,
    durationSec: song.durationSec,
    artworkUrl,
    artworkSrcSet: artworkUrl,
    thumbnailArtworkSrcSet: artworkUrl,
    playbackUrl: `mse:${song.id}`,
  };
}

function readDraft(songId: string): { draft: string; lines: Line[] } {
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${songId}`);
    if (!stored) return { draft: "", lines: [] };
    const value = JSON.parse(stored) as { draft?: string; lines?: Line[] };
    return {
      draft: value.draft || "",
      lines: Array.isArray(value.lines)
        ? value.lines.map((line) => ({
            text: typeof line.text === "string" ? line.text : "",
            startTimeMs: Number.isFinite(line.startTimeMs)
              ? line.startTimeMs
              : -1,
            endTimeMs: Number.isFinite(line.endTimeMs) ? line.endTimeMs : -1,
            kind: line.kind === "INSTRUMENTAL" ? "INSTRUMENTAL" : "LYRIC",
          }))
        : [],
    };
  } catch {
    return { draft: "", lines: [] };
  }
}

function readLastEditedSong(): SongSummary | null {
  try {
    const raw = window.localStorage.getItem(LAST_SONG_STORAGE_KEY);
    if (!raw) return null;
    const song = JSON.parse(raw) as Partial<SongSummary>;
    if (typeof song.id !== "string" || typeof song.title !== "string")
      return null;
    return {
      id: song.id,
      title: song.title,
      artist: typeof song.artist === "string" ? song.artist : "",
      album: typeof song.album === "string" ? song.album : "",
      coverUrl: typeof song.coverUrl === "string" ? song.coverUrl : "",
      durationSec:
        typeof song.durationSec === "number" &&
        Number.isFinite(song.durationSec)
          ? song.durationSec
          : 0,
      isPublic: Boolean(song.isPublic),
      status: typeof song.status === "number" ? song.status : 0,
      createdAt:
        typeof song.createdAt === "number" && Number.isFinite(song.createdAt)
          ? song.createdAt
          : 0,
    };
  } catch {
    return null;
  }
}

export function LyricsEditor() {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [search, setSearch] = useState("");
  const [songId, setSongId] = useState("");
  const [selectedSong, setSelectedSong] = useState<SongSummary | null>(null);
  const [catalogPlayerSong, setCatalogPlayerSong] = useState<PlayerSong | null>(
    null,
  );
  const [lastSavedPreviewSong, setLastSavedPreviewSong] =
    useState<PlayerSong | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [loadedSongId, setLoadedSongId] = useState("");
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorPlaybackRate, setEditorPlaybackRate] = useState(1);
  const [isRatePickerOpen, setIsRatePickerOpen] = useState(false);
  const [pendingAuditionTimeMs, setPendingAuditionTimeMs] = useState<
    number | null
  >(null);
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const timingScrollRef = useRef<HTMLDivElement>(null);
  const ratePickerRef = useRef<HTMLDivElement>(null);
  const originalLineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const isMirroringScrollRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<number | undefined>(undefined);
  const shouldAutoFollowRef = useRef(false);
  const hasRestoredLastSongRef = useRef(false);
  const playbackTimeMs = usePlayerStore((state) => state.playbackTimeMs);
  const currentPlayerSongId = usePlayerStore((state) => state.currentSong?.id);
  const setSong = usePlayerStore((state) => state.setSong);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);

  const activeSong = selectedSong ?? songs.find((song) => song.id === songId);
  const displaySong =
    catalogPlayerSong?.id === activeSong?.id
      ? catalogPlayerSong
      : activeSong
        ? fallbackPlayerSong(activeSong)
        : null;
  const hasDisplayArtwork =
    Boolean(displaySong?.artworkUrl) &&
    displaySong?.artworkUrl !== "/assets/artwork/1x1.gif";
  const selected = selectedLine === null ? undefined : lines[selectedLine];
  const timedLines = useMemo(() => lines.filter(isTimed).length, [lines]);
  const hasTimeline = !showSetup && lines.length > 0;
  const openSongForEditing = useCallback((song: SongSummary) => {
    const local = readDraft(song.id);
    window.localStorage.setItem(LAST_SONG_STORAGE_KEY, JSON.stringify(song));
    setCatalogPlayerSong(null);
    setLastSavedPreviewSong(null);
    setIsPreviewing(false);
    setSelectedSong(song);
    setSearch(`${song.title} — ${song.artist}`);
    setLoadedSongId("");
    setSongId(song.id);
    setLoadingLyrics(true);
    setDraft(local.draft);
    setLines(local.lines);
    setSelectedLine(local.lines.length ? 0 : null);
    setShowSetup(!local.lines.length);
    setIsTextEditing(false);
    setMessage("");
  }, []);

  useEffect(() => {
    setPlaybackRate(editorPlaybackRate);
    return () => setPlaybackRate(1);
  }, [editorPlaybackRate, setPlaybackRate]);

  useEffect(() => {
    if (!isRatePickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      if (!ratePickerRef.current?.contains(event.target as Node))
        setIsRatePickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsRatePickerOpen(false);
    };
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isRatePickerOpen]);

  useEffect(() => {
    if (hasRestoredLastSongRef.current) return;
    const lastSong = readLastEditedSong();
    if (!lastSong) {
      hasRestoredLastSongRef.current = true;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      hasRestoredLastSongRef.current = true;
      openSongForEditing(lastSong);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openSongForEditing]);

  useEffect(() => {
    if (pendingAuditionTimeMs === null || currentPlayerSongId !== songId)
      return;

    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("musical:seek", {
          detail: { timeMs: pendingAuditionTimeMs },
        }),
      );
      if (!usePlayerStore.getState().playing) {
        usePlayerStore.getState().togglePlayback();
      }
      setPendingAuditionTimeMs(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentPlayerSongId, pendingAuditionTimeMs, songId]);

  useEffect(() => {
    if (!isPreviewing || currentPlayerSongId !== songId) return;

    const activeIndex = lines.findIndex(
      (line) =>
        line.startTimeMs >= 0 &&
        playbackTimeMs >= line.startTimeMs &&
        (line.endTimeMs < 0 || playbackTimeMs < line.endTimeMs),
    );
    if (activeIndex < 0 || activeIndex === selectedLine) return;

    const frame = window.requestAnimationFrame(() => {
      shouldAutoFollowRef.current = true;
      setSelectedLine(activeIndex);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    currentPlayerSongId,
    isPreviewing,
    lines,
    playbackTimeMs,
    selectedLine,
    songId,
  ]);

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    void loadCatalogTracks([songId])
      .then(([song]) => {
        if (!cancelled && song) setCatalogPlayerSong(song);
      })
      .catch(() => {
        // A private or not-yet-indexed song continues with its private metadata.
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listMySongs({ limit: 50, search: search.trim() || undefined })
        .then((data) => {
          if (cancelled) return;
          setSongs(data.songs);
          // Migrate the short-lived format used before snapshots were stored.
          const legacySongId = window.localStorage.getItem(
            LAST_SONG_STORAGE_KEY,
          );
          if (!legacySongId || legacySongId.startsWith("{")) return;
          const legacySong = data.songs.find(
            (song) => song.id === legacySongId,
          );
          if (legacySong) openSongForEditing(legacySong);
        })
        .catch(
          () => !cancelled && setMessage("Không thể tải danh sách bài hát."),
        );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [openSongForEditing, search]);

  useEffect(() => {
    if (songId && songId === loadedSongId)
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${songId}`,
        JSON.stringify({ draft, lines }),
      );
  }, [draft, lines, loadedSongId, songId]);

  useEffect(() => {
    if (!songId) return;

    let cancelled = false;

    void http
      .get<LyricsDocument>(
        `/studio/catalog/songs/${encodeURIComponent(songId)}/lyrics`,
      )
      .then((response) => {
        if (cancelled) return;
        const document = response.data;
        const restoredLines: Line[] = document.lines.map((line) => ({
          text: line.text,
          startTimeMs: line.startTimeMs,
          endTimeMs: line.endTimeMs,
          kind: line.kind === "INSTRUMENTAL" ? "INSTRUMENTAL" : "LYRIC",
        }));
        if (!restoredLines.length) return;

        setDraft(document.plainText);
        setLines(restoredLines);
        setSelectedLine(0);
        setShowSetup(false);
      })
      .catch(() => {
        // A song without lyrics starts from its local draft or a blank setup.
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLyrics(false);
          setLoadedSongId(songId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [songId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !songId ||
        ["TEXTAREA", "INPUT", "SELECT"].includes(target?.tagName || "")
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.key !== "Enter" || selectedLine === null) return;
      event.preventDefault();
      setIsPreviewing(false);
      const current = lines[selectedLine];
      if (!current) return;
      if (current.startTimeMs < 0) {
        setLines((items) =>
          items.map((line, index) =>
            index === selectedLine
              ? {
                  ...line,
                  startTimeMs: playbackTimeMs,
                  endTimeMs:
                    line.endTimeMs > playbackTimeMs ? line.endTimeMs : -1,
                }
              : line,
          ),
        );
        setMessage(
          `Đã bắt đầu dòng ${selectedLine + 1}. Nhấn Enter khi câu tiếp theo bắt đầu.`,
        );
        return;
      }
      if (playbackTimeMs <= current.startTimeMs) {
        setMessage("Mốc tiếp theo phải nằm sau mốc bắt đầu.");
        return;
      }
      if (selectedLine === lines.length - 1) {
        setLines((items) =>
          items.map((line, index) =>
            index === selectedLine
              ? { ...line, endTimeMs: playbackTimeMs }
              : line,
          ),
        );
        setMessage("Đã căn xong dòng cuối.");
        return;
      }
      const next = selectedLine + 1;
      setLines((items) =>
        items.map((line, index) => {
          if (index === selectedLine)
            return { ...line, endTimeMs: playbackTimeMs };
          if (index === next)
            return {
              ...line,
              startTimeMs: playbackTimeMs,
              endTimeMs: line.endTimeMs > playbackTimeMs ? line.endTimeMs : -1,
            };
          return line;
        }),
      );
      shouldAutoFollowRef.current = true;
      setSelectedLine(next);
      setMessage(`Đang căn dòng ${next + 1}.`);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lines, playbackTimeMs, selectedLine, songId, togglePlayback]);

  useEffect(() => {
    if (selectedLine === null || !shouldAutoFollowRef.current) return;
    shouldAutoFollowRef.current = false;
    const original = originalScrollRef.current;
    const timing = timingScrollRef.current;
    const originalLine = originalLineRefs.current[selectedLine];
    if (!original || !timing || !originalLine) return;
    const lineTop =
      originalLine.getBoundingClientRect().top -
      original.getBoundingClientRect().top +
      original.scrollTop;
    const sharedMaxScrollTop = Math.min(
      original.scrollHeight - original.clientHeight,
      timing.scrollHeight - timing.clientHeight,
    );
    const targetTop = Math.max(
      0,
      Math.min(
        sharedMaxScrollTop,
        lineTop - original.clientHeight * 0.42 + originalLine.offsetHeight / 2,
      ),
    );
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
    original.scrollTo({ top: targetTop, behavior: "smooth" });
    timing.scrollTo({ top: targetTop, behavior: "smooth" });
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimerRef.current = undefined;
    }, 420);
  }, [selectedLine]);

  useEffect(() => {
    const original = originalScrollRef.current;
    const timing = timingScrollRef.current;
    if (!original || !timing) return;

    const mirrorScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
      if (isMirroringScrollRef.current || isProgrammaticScrollRef.current)
        return;
      isMirroringScrollRef.current = true;
      target.scrollTop = source.scrollTop;
      window.requestAnimationFrame(() => {
        isMirroringScrollRef.current = false;
      });
    };
    const syncOriginal = () => mirrorScroll(original, timing);
    const syncTiming = () => mirrorScroll(timing, original);
    original.addEventListener("scroll", syncOriginal, { passive: true });
    timing.addEventListener("scroll", syncTiming, { passive: true });
    return () => {
      original.removeEventListener("scroll", syncOriginal);
      timing.removeEventListener("scroll", syncTiming);
    };
  }, [hasTimeline, isTextEditing]);

  const createTimeline = () => {
    const next = draft
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((text) => ({ ...newLine("LYRIC"), text }));
    setLines(next);
    setSelectedLine(next.length ? 0 : null);
    if (next.length) {
      setShowSetup(false);
      setIsTextEditing(false);
      setMessage(
        "Dòng 01 đã sẵn sàng. Mở player, rồi nhấn Enter khi câu đầu bắt đầu.",
      );
    } else setMessage("Hãy nhập ít nhất một câu lyric.");
  };
  const applyTextEdit = () => {
    const nextText = draft
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!nextText.length) {
      setMessage("Hãy giữ lại ít nhất một câu lyric.");
      return;
    }
    setLines(nextText.map((text) => ({ ...newLine("LYRIC"), text })));
    setSelectedLine(0);
    setIsTextEditing(false);
    setMessage("Đã thay lời mới. Hãy căn lại các mốc thời gian.");
  };
  const previewSong = (song: PlayerSong) => {
    setSong(song);
    setIsPreviewing(true);
  };
  const openPlayer = () => {
    if (!activeSong) return;
    const fallback = fallbackPlayerSong(activeSong);
    setIsPreviewing(false);
    setSong(
      catalogPlayerSong?.id === activeSong.id ? catalogPlayerSong : fallback,
    );
  };
  const auditionLine = (index: number) => {
    const line = lines[index];
    setSelectedLine(index);
    if (!line || !isTimed(line) || !activeSong) return;

    void openPlayer();
    setPendingAuditionTimeMs(line.startTimeMs);
  };
  const updateSelected = (patch: Partial<Line>) =>
    selectedLine !== null &&
    setLines((items) =>
      items.map((line, index) =>
        index === selectedLine ? { ...line, ...patch } : line,
      ),
    );
  const updateSelectedStart = (nextStartTimeMs: number) => {
    if (selectedLine === null) return;
    const selectedItem = lines[selectedLine];
    if (
      !selectedItem ||
      selectedItem.startTimeMs < 0 ||
      !Number.isFinite(nextStartTimeMs)
    )
      return;
    const previous = lines[selectedLine - 1];
    const minimum = previous?.startTimeMs >= 0 ? previous.startTimeMs + 80 : 0;
    const maximum =
      selectedItem.endTimeMs > selectedItem.startTimeMs
        ? selectedItem.endTimeMs - 80
        : Number.MAX_SAFE_INTEGER;
    const startTimeMs = Math.round(
      Math.min(maximum, Math.max(minimum, nextStartTimeMs)),
    );
    setLines((items) =>
      items.map((line, index) => {
        if (index === selectedLine) return { ...line, startTimeMs };
        if (index === selectedLine - 1 && line.endTimeMs >= 0)
          return { ...line, endTimeMs: startTimeMs };
        return line;
      }),
    );
  };
  const insert = (kind: LineKind, before: boolean) => {
    const position =
      selectedLine === null ? lines.length : selectedLine + (before ? 0 : 1);
    setLines((items) => [
      ...items.slice(0, position),
      newLine(kind),
      ...items.slice(position),
    ]);
    setSelectedLine(position);
    setMessage(
      kind === "INSTRUMENTAL"
        ? "Đã chèn đoạn nhạc không lời. Nhấn Enter tại đầu và cuối đoạn."
        : "Đã chèn dòng mới.",
    );
  };
  const addIntro = () => {
    setLines((items) => [
      { kind: "INSTRUMENTAL", text: "", startTimeMs: 0, endTimeMs: -1 },
      ...items,
    ]);
    setSelectedLine(0);
    setMessage(
      "Đã thêm nhạc dạo từ 0:00. Nhấn Enter khi câu hát đầu tiên bắt đầu.",
    );
  };
  const remove = () => {
    if (selectedLine === null) return;
    const next =
      lines.length > 1 ? Math.min(selectedLine, lines.length - 2) : null;
    setLines((items) => items.filter((_, index) => index !== selectedLine));
    setSelectedLine(next);
  };
  const save = async (publish: boolean) => {
    if (!songId || !lines.length) {
      setMessage("Chọn bài hát và tạo timeline trước khi lưu.");
      return;
    }
    if (publish && timedLines !== lines.length) {
      setMessage("Cần căn đủ tất cả các dòng trước khi xuất bản.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await http.post(
        `/studio/catalog/songs/${encodeURIComponent(songId)}/lyrics`,
        {
          language: "vi",
          publish,
          syncMode: "LINE",
          lines: lines.map((line, position) => ({
            ...line,
            position,
            words: [],
          })),
        },
      );
      setLastSavedPreviewSong(displaySong);
      setIsPreviewing(false);
      setMessage(
        publish
          ? "Đã xuất bản lời đồng bộ. Bạn có thể xem thử ngay tại đây."
          : "Đã lưu bản nháp. Bạn có thể xem thử ngay tại đây.",
      );
    } catch {
      setMessage("Không thể lưu. Kiểm tra lại các mốc thời gian.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden bg-(--background)">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-(--labelDivider) px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-(--systemQuaternary) bg-cover bg-center text-sm text-(--systemPrimary) [font:var(--headline)]"
            style={
              hasDisplayArtwork
                ? { backgroundImage: `url("${displaySong?.artworkUrl}")` }
                : undefined
            }
          >
            {!hasDisplayArtwork &&
              (displaySong?.title || "L").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm text-(--systemPrimary) [font:var(--headline)]">
              {displaySong?.title || "Chọn bài hát để bắt đầu"}
            </h1>
            <p className="mt-0.5 truncate text-xs text-(--systemSecondary)">
              {displaySong
                ? [
                    displaySong.artist,
                    displaySong.album,
                    formatTime(displaySong.durationSec * 1000),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Lyrics Sync workspace"}
            </p>
          </div>
          <span className="hidden rounded-full bg-(--systemQuaternary) px-2.5 py-1 text-[11px] text-(--systemSecondary) min-[900px]:inline-flex">
            {timedLines === lines.length
              ? "Sẵn sàng xuất bản"
              : "Đang soạn thảo"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void openPlayer()}
            className="rounded-full border border-(--labelDivider) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
          >
            Mở player
          </button>
          <span className="font-mono text-base text-(--systemPrimary)">
            {formatTime(playbackTimeMs)}
          </span>
          <div ref={ratePickerRef} className="relative">
            <button
              type="button"
              aria-expanded={isRatePickerOpen}
              aria-haspopup="listbox"
              aria-label="Tốc độ phát"
              onClick={() => setIsRatePickerOpen((open) => !open)}
              className="flex min-w-20 items-center justify-between gap-2 rounded-full border border-(--labelDivider) bg-(--background) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
            >
              {editorPlaybackRate}×
              <span aria-hidden className="text-xs text-(--systemSecondary)">
                ▾
              </span>
            </button>
            {isRatePickerOpen && (
              <div
                role="listbox"
                aria-label="Chọn tốc độ phát"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-32 overflow-hidden rounded-xl border border-(--labelDivider) bg-(--background) p-1 shadow-xl"
              >
                {PLAYBACK_RATES.map((rate) => {
                  const active = rate === editorPlaybackRate;
                  return (
                    <button
                      key={rate}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setEditorPlaybackRate(rate);
                        setIsRatePickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${active ? "bg-(--keyColor)/15 text-(--keyColor) [font:var(--callout-emphasized)]" : "text-(--systemPrimary) hover:bg-(--systemQuaternary)"}`}
                    >
                      {rate}×{active && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving}
            className="rounded-full border border-(--labelDivider) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary) disabled:opacity-50"
          >
            Lưu nháp
          </button>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="rounded-full bg-(--keyColor) px-4 py-2 text-sm text-(--keyColorText) disabled:opacity-50"
          >
            Xuất bản
          </button>
        </div>
      </header>
      {message && (
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-3">
          <p className="text-sm text-(--systemSecondary)">{message}</p>
          {lastSavedPreviewSong && (
            <button
              type="button"
              onClick={() => previewSong(lastSavedPreviewSong)}
              className="shrink-0 rounded-full border border-(--labelDivider) px-3 py-1.5 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
            >
              Xem thử
            </button>
          )}
        </div>
      )}
      <div className="mt-2 grid min-h-0 flex-1 overflow-hidden min-[850px]:grid-cols-2 min-[1200px]:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <section className="flex min-h-0 min-w-0 flex-col border-b border-(--labelDivider) min-[850px]:border-b-0 min-[850px]:border-r">
          {hasTimeline ? (
            <>
              <header className="flex items-center justify-between border-b border-(--labelDivider) px-6 py-2">
                <h3 className="text-xs font-semibold tracking-[0.14em] text-(--systemPrimary)">
                  LỜI BÀI HÁT GỐC
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(
                      lines
                        .filter((line) => line.kind === "LYRIC")
                        .map((line) => line.text)
                        .join("\n"),
                    );
                    setIsTextEditing(true);
                  }}
                  className="text-sm text-(--keyColor)"
                >
                  Sửa văn bản
                </button>
              </header>
              {isTextEditing ? (
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  <label className="flex min-h-0 flex-1 flex-col text-sm text-(--systemPrimary) [font:var(--callout-emphasized)]">
                    Chỉnh lời bài hát
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      className="mt-3 min-h-48 flex-1 resize-none rounded-xl border border-(--labelDivider) bg-(--systemQuinary) p-4 font-normal leading-7 text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)"
                    />
                  </label>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTextEditing(false)}
                      className="rounded-full border border-(--labelDivider) px-4 py-2 text-sm text-(--systemPrimary)"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      onClick={applyTextEdit}
                      className="rounded-full bg-(--keyColor) px-4 py-2 text-sm text-(--keyColorText)"
                    >
                      Tạo lại timeline
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={originalScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto px-6 py-3 pb-[60vh] text-(--systemPrimary) scrollbar-none [&::-webkit-scrollbar]:hidden"
                >
                  {lines.map((line, index) => (
                    <p
                      ref={(node) => {
                        originalLineRefs.current[index] = node;
                      }}
                      key={`${index}-${line.kind}-${line.text}`}
                      title={
                        line.kind === "INSTRUMENTAL"
                          ? "Đoạn nhạc không lời"
                          : line.text
                      }
                      className={`flex min-h-13 items-center truncate border-b border-transparent px-4 py-2 text-[15px] leading-6 transition-colors ${index === selectedLine ? "rounded-lg bg-(--systemQuaternary) [font:var(--body-emphasized)]" : ""}`}
                    >
                      {line.kind === "INSTRUMENTAL"
                        ? "[Đoạn nhạc không lời]"
                        : line.text || "Dòng lyric trống"}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold tracking-[0.14em] text-(--systemPrimary)">
                    THIẾT LẬP LỜI BÀI HÁT
                  </h3>
                  <p className="mt-2 text-sm text-(--systemSecondary)">
                    Chọn bài, dán mỗi câu trên một dòng, rồi tạo timeline ở ngay
                    workspace này.
                  </p>
                </div>
                <span className="shrink-0 text-xs text-(--systemSecondary)">
                  Bước 1 / 2
                </span>
              </div>
              <label className="mt-6 block text-sm text-(--systemPrimary) [font:var(--callout-emphasized)]">
                Bài hát
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    if (selectedSong) {
                      setSelectedSong(null);
                      setSongId("");
                      setLoadedSongId("");
                      setDraft("");
                      setLines([]);
                      setSelectedLine(null);
                    }
                  }}
                  placeholder="Tìm tên bài hát"
                  className="mt-2 w-full rounded-xl border border-(--labelDivider) bg-(--systemQuinary) px-3 py-3 text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)"
                />
              </label>
              {selectedSong ? (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-(--keyColor)/35 bg-(--keyColor)/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-(--systemPrimary) [font:var(--body-emphasized)]">
                      {selectedSong.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-(--systemSecondary)">
                      {selectedSong.artist}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSong(null);
                      setSongId("");
                      setLoadedSongId("");
                      setSearch("");
                      setDraft("");
                      setLines([]);
                      setSelectedLine(null);
                    }}
                    className="ml-3 text-sm text-(--keyColor)"
                  >
                    Đổi bài
                  </button>
                </div>
              ) : search.trim() ? (
                <div className="mt-3 max-h-36 overflow-y-auto rounded-xl border border-(--labelDivider) bg-(--background)">
                  {songs.length ? (
                    songs.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => openSongForEditing(song)}
                        className="flex w-full flex-col px-4 py-3 text-left transition hover:bg-(--systemQuinary)"
                      >
                        <span className="text-sm text-(--systemPrimary)">
                          {song.title}
                        </span>
                        <span className="mt-0.5 text-xs text-(--systemSecondary)">
                          {song.artist}
                          {song.album ? ` · ${song.album}` : ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm text-(--systemSecondary)">
                      Không tìm thấy bài hát phù hợp.
                    </p>
                  )}
                </div>
              ) : null}
              <label className="mt-6 flex min-h-0 flex-1 flex-col text-sm text-(--systemPrimary) [font:var(--callout-emphasized)]">
                Lời bài hát
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={"Câu hát đầu tiên\nCâu hát tiếp theo"}
                  className="mt-2 min-h-44 flex-1 resize-none rounded-xl border border-(--labelDivider) bg-(--systemQuinary) p-4 font-normal leading-7 text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)"
                />
              </label>
              <button
                type="button"
                disabled={!songId || !draft.trim() || loadingLyrics}
                onClick={createTimeline}
                className="mt-4 w-fit rounded-full bg-(--keyColor) px-5 py-2.5 text-sm text-(--keyColorText) disabled:opacity-50"
              >
                {loadingLyrics ? "Đang mở lyric…" : "Tạo dòng đồng bộ"}
              </button>
            </div>
          )}
        </section>
        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="border-b border-(--labelDivider) px-6 py-2.5">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-(--systemPrimary)">
              DÒNG THỜI GIAN ĐỒNG BỘ
            </h3>
          </header>
          <div
            ref={timingScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-6 py-3 pb-[60vh] scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {!hasTimeline && (
              <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
                <p className="text-sm text-(--systemPrimary) [font:var(--callout-emphasized)]">
                  Timeline sẽ hiện ở đây
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-(--systemSecondary)">
                  Chọn bài hát, nhập lời ở cột bên trái và tạo dòng đồng bộ để
                  bắt đầu căn thời gian.
                </p>
              </div>
            )}
            {lines.map((line, index) => {
              const completed = isTimed(line);
              const current = index === selectedLine;
              const touchesCurrent =
                current ||
                index === (selectedLine ?? -2) - 1 ||
                index === hoveredLine ||
                index === (hoveredLine ?? -2) - 1;
              return (
                <button
                  key={`${index}-${line.kind}-${line.text}`}
                  type="button"
                  onClick={() => auditionLine(index)}
                  onMouseEnter={() => setHoveredLine(index)}
                  onMouseLeave={() => setHoveredLine(null)}
                  className={`grid min-h-13 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b px-3 py-2 text-left transition-colors ${touchesCurrent ? "border-b-transparent" : "border-b-(--labelDivider)"} ${current ? "border-l-[3px] border-l-(--keyColor) bg-(--keyColor)/10" : completed ? "hover:bg-(--systemQuaternary)" : "hover:bg-(--systemQuinary)"}`}
                >
                  <span
                    className={`rounded border px-2 py-1 font-mono text-[11px] ${completed ? "border-(--keyColor)/30 bg-(--background) text-(--keyColor)" : "border-(--labelDivider) text-(--systemSecondary)"}`}
                  >
                    {completed
                      ? `[${formatTime(line.startTimeMs)}]`
                      : "[--:--.--]"}
                  </span>
                  <span
                    className={`truncate text-sm ${current ? "[font:var(--body-emphasized)] text-(--systemPrimary)" : "text-(--systemSecondary)"}`}
                  >
                    {line.kind === "INSTRUMENTAL"
                      ? "Đoạn nhạc không lời"
                      : line.text || "Dòng lyric trống"}
                  </span>
                  <span
                    className={
                      completed
                        ? "text-(--keyColor)"
                        : current
                          ? "text-(--keyColor) text-[10px] uppercase"
                          : "text-(--systemTertiary)"
                    }
                  >
                    {completed ? "●" : current ? "Đang chờ" : "○"}
                  </span>
                </button>
              );
            })}
          </div>
          {hasTimeline && selected && selectedLine !== null && (
            <div className="relative bottom-12 z-10 shrink-0 border-t border-(--labelDivider) bg-(--background) px-6 py-3">
              <div className="flex flex-col gap-3">
                {selected.kind === "LYRIC" && (
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-(--systemSecondary)">
                      Dòng đang chọn
                    </span>
                    <input
                      value={selected.text}
                      onChange={(event) =>
                        updateSelected({ text: event.target.value })
                      }
                      aria-label="Nội dung lyric"
                      className="w-full rounded-xl border border-(--labelDivider) bg-(--systemQuinary) px-3 py-2.5 text-sm text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)"
                    />
                  </label>
                )}
                {selected.startTimeMs >= 0 && (
                  <div className="flex flex-col gap-3 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between">
                    <div>
                      <p className="text-sm text-(--systemPrimary) [font:var(--callout-emphasized)]">
                        Mốc vào câu
                      </p>
                      <p className="mt-0.5 text-xs text-(--systemSecondary)">
                        Tinh chỉnh theo bước 100 mili giây.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start min-[1100px]:self-auto">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedStart(selected.startTimeMs - 100)
                        }
                        className="rounded-lg border border-(--labelDivider) bg-(--background) px-3 py-2 text-xs text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                      >
                        − 0.10s
                      </button>
                      <input
                        aria-label="Thời điểm bắt đầu câu theo giây"
                        type="number"
                        min="0"
                        step="0.01"
                        value={(selected.startTimeMs / 1000).toFixed(2)}
                        onChange={(event) =>
                          updateSelectedStart(Number(event.target.value) * 1000)
                        }
                        className="w-24 rounded-lg border border-(--labelDivider) bg-(--background) px-2 py-2 text-center font-mono text-sm text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedStart(selected.startTimeMs + 100)
                        }
                        className="rounded-lg border border-(--labelDivider) bg-(--background) px-3 py-2 text-xs text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                      >
                        + 0.10s
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {selectedLine === 0 && (
                      <button
                        type="button"
                        onClick={addIntro}
                        className="rounded-lg border border-(--labelDivider) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                      >
                        + Nhạc dạo đầu
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => insert("LYRIC", false)}
                      className="rounded-lg border border-(--labelDivider) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                    >
                      + Thêm dòng
                    </button>
                    <button
                      type="button"
                      onClick={() => insert("INSTRUMENTAL", false)}
                      className="rounded-lg border border-(--labelDivider) px-3 py-2 text-sm text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                    >
                      + Đoạn nhạc
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelected({ startTimeMs: -1, endTimeMs: -1 })
                      }
                      className="rounded-lg px-3 py-2 text-sm text-(--systemSecondary) transition hover:bg-(--systemQuaternary)"
                    >
                      Xoá mốc
                    </button>
                    <button
                      type="button"
                      onClick={() => remove()}
                      className="rounded-lg px-3 py-2 text-sm text-red-400 transition hover:bg-red-400/10"
                    >
                      Xoá dòng
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
