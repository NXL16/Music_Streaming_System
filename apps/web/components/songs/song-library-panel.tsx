"use client";

import { memo, useMemo, useState } from "react";
import { SongDetailDrawer } from "@/components/songs/song-detail-drawer";
import { useSongLibrary } from "@/lib/songs/use-song-library";
import type { SongStatus, SongSummary } from "@/lib/songs/song.types";
import { formatDuration } from "@/lib/format/duration";

const statusLabel: Record<SongStatus, string> = {
  0: "Unknown",
  1: "Pending",
  2: "Processing",
  3: "Ready",
  4: "Failed",
};

const statusClass: Record<SongStatus, string> = {
  0: "bg-[#f2f2f7] text-[#6e6e73]",
  1: "bg-[#fff7e6] text-[#a05a00]",
  2: "bg-[#eef5ff] text-[#0066cc]",
  3: "bg-[#ecfdf3] text-[#067647]",
  4: "bg-[#fff1f3] text-[#d91d32]",
};

function SongArtwork({ title, index }: { title: string; index: number }) {
  const gradients = [
    "from-[#ff375f] via-[#ff9f0a] to-[#af52de]",
    "from-[#0a84ff] via-[#64d2ff] to-[#5e5ce6]",
    "from-[#30d158] via-[#ffd60a] to-[#ff375f]",
    "from-[#bf5af2] via-[#ff375f] to-[#ff9f0a]",
  ];

  return (
    <div
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br ${gradients[index % gradients.length]} text-lg font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]`}
    >
      <div className="absolute inset-0 bg-white/10" />
      <span className="relative">{(title || "S").charAt(0).toUpperCase()}</span>
    </div>
  );
}

const SongRow = memo(function SongRow({
  song,
  index,
  deleting,
  onDelete,
  onSelect,
}: {
  song: SongSummary;
  index: number;
  deleting: boolean;
  onDelete: (songId: string) => void;
  onSelect: (songId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(song.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(song.id);
        }
      }}
      className="group grid w-full cursor-pointer grid-cols-[48px_1fr_auto] items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#fa233b]/40 md:grid-cols-[48px_1fr_180px_120px_96px]"
    >
      <SongArtwork title={song.title} index={index} />

      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-[#1d1d1f]">
          {song.title || "Untitled Song"}
        </p>
        <p className="mt-0.5 truncate text-sm text-[#6e6e73]">
          {song.artist || "Unknown Artist"}
        </p>
      </div>

      <p className="hidden truncate text-sm text-[#6e6e73] md:block">
        {song.album || "Single"}
      </p>

      <div className="hidden md:block">
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass[song.status]}`}
        >
          {statusLabel[song.status]}
        </span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="hidden text-sm font-medium text-[#86868b] sm:inline">
          {formatDuration(song.durationSec, "--:--")}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(song.id);
          }}
          disabled={deleting}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#6e6e73] opacity-100 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea] transition hover:bg-[#fff1f3] hover:text-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60 md:opacity-0 md:group-hover:opacity-100"
        >
          {deleting ? "Removing" : "Remove"}
        </button>
      </div>
    </div>
  );
});

function EmptyLibrary({ onUploadClick }: { onUploadClick?: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-4xl bg-linear-to-br from-[#ff375f] via-[#ff9f0a] to-[#af52de] text-4xl font-bold text-white shadow-[0_24px_60px_rgba(250,35,59,0.2)]">
        MS
      </div>
      <h3 className="mt-7 text-3xl font-bold tracking-[-0.045em] text-[#1d1d1f]">
        Your library is empty
      </h3>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-[#6e6e73]">
        Upload your first track and it will appear here immediately, even while
        the worker is still processing it.
      </p>
      {onUploadClick && (
        <button
          type="button"
          onClick={onUploadClick}
          className="mt-7 rounded-full bg-[#fa233b] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#d91d32]"
        >
          Upload your first song
        </button>
      )}
    </div>
  );
}

export function SongLibraryPanel({
  refreshKey = 0,
  onUploadClick,
}: {
  refreshKey?: number;
  onUploadClick?: () => void;
}) {
  const {
    songs,
    error,
    loading,
    loadingMore,
    deletingSongId,
    hasMore,
    refresh,
    loadMore,
    removeSong,
  } = useSongLibrary(refreshKey);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const safeSongs = useMemo(() => songs ?? [], [songs]);
  const readyCount = useMemo(
    () => safeSongs.filter((song) => song.status === 3).length,
    [safeSongs],
  );

  return (
    <>
      <section className="overflow-hidden rounded-4xl bg-white/92 shadow-[0_18px_50px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea] backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-[#e5e5ea] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tighter text-[#1d1d1f]">
              Songs
            </h2>
            <p className="mt-1 text-sm text-[#6e6e73]">
              {safeSongs.length} total / {readyCount} ready
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full bg-[#f2f2f7] px-4 py-2 text-sm font-bold text-[#1d1d1f] transition hover:bg-[#e5e5ea] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="m-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
            {error}
          </div>
        )}

        {safeSongs.length > 0 && (
          <div className="hidden grid-cols-[48px_1fr_180px_120px_96px] gap-4 border-b border-[#e5e5ea] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#86868b] md:grid">
            <span />
            <span>Title</span>
            <span>Album</span>
            <span>Status</span>
            <span className="text-right">Time</span>
          </div>
        )}

        <div className="p-2">
          {loading && safeSongs.length === 0 && (
            <div className="px-5 py-10 text-center text-[#6e6e73]">
              Loading your library...
            </div>
          )}

          {!loading && safeSongs.length === 0 && (
            <EmptyLibrary onUploadClick={onUploadClick} />
          )}

          {safeSongs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              index={index}
              deleting={deletingSongId === song.id}
              onDelete={(songId) => void removeSong(songId)}
              onSelect={setSelectedSongId}
            />
          ))}
        </div>

        {hasMore && (
          <div className="border-t border-[#e5e5ea] p-5">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full rounded-full bg-[#f2f2f7] px-5 py-3 text-sm font-bold text-[#1d1d1f] transition hover:bg-[#e5e5ea] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Loading more..." : "Load more"}
            </button>
          </div>
        )}
      </section>

      <SongDetailDrawer
        songId={selectedSongId}
        onClose={() => setSelectedSongId(null)}
      />
    </>
  );
}
