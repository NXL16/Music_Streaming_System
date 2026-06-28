"use client";

import { formatDateTime } from "@/lib/format/date";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { useSongDetail } from "@/lib/songs/use-song-detail";
import type { SongStatus } from "@/lib/songs/song.types";

type SongDetailDrawerProps = {
  songId: string | null;
  onClose: () => void;
};

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

function formatDuration(seconds: number) {
  if (!seconds) return "--:--";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/72 px-4 py-3 ring-1 ring-[#e5e5ea]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#86868b]">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-[#1d1d1f]">{value}</div>
    </div>
  );
}

export function SongDetailDrawer({ songId, onClose }: SongDetailDrawerProps) {
  const { song, loading, error, reload } = useSongDetail(songId);
  const setPlayerSong = usePlayerStore((state) => state.setSong);

  if (!songId) {
    return null;
  }

  const ready = song?.status === 3;

  function handlePlay() {
    if (!song || !ready) return;

    setPlayerSong({
      id: song.id,
      title: song.title || "Untitled Song",
      artist: song.artist || "Unknown Artist",
      album: song.album || "Single",
      durationSec: song.durationSec || 0,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/24 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close song details"
        className="hidden flex-1 cursor-default md:block"
        onClick={onClose}
      />

      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#f5f5f7] shadow-[-24px_0_80px_rgba(0,0,0,0.18)] ring-1 ring-[#e5e5ea]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d2d2d7] bg-[#f5f5f7]/88 px-5 py-4 backdrop-blur-2xl">
          <p className="text-sm font-bold text-[#1d1d1f]">Details</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea] transition hover:bg-[#ededf0]"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="rounded-[2rem] bg-white px-5 py-10 text-center text-[#6e6e73] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
              Loading song details...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              {error}
              <button
                type="button"
                onClick={() => void reload()}
                className="mt-3 block rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1d1d1f] ring-1 ring-[#e5e5ea]"
              >
                Retry
              </button>
            </div>
          ) : null}

          {song ? (
            <>
              <section className="overflow-hidden rounded-[2rem] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
                <div className="bg-linear-to-b from-white to-[#f5f5f7] px-6 py-8 text-center">
                  <div className="mx-auto flex aspect-square w-52 max-w-full items-center justify-center rounded-[2rem] bg-linear-to-br from-[#ff375f] via-[#ff9f0a] to-[#af52de] text-7xl font-bold text-white shadow-[0_28px_70px_rgba(250,35,59,0.24)]">
                    {(song.title || "S").charAt(0).toUpperCase()}
                  </div>

                  <p className="mt-7 text-sm font-semibold text-[#6e6e73]">
                    {song.artist || "Unknown Artist"}
                  </p>
                  <h3 className="mt-1 break-words text-4xl font-bold tracking-[-0.055em] text-[#1d1d1f]">
                    {song.title || "Untitled Song"}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-[#6e6e73]">
                    {song.album || "Single"}
                  </p>

                  <div className="mt-5 flex justify-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass[song.status]}`}
                    >
                      {statusLabel[song.status]}
                    </span>
                    <span className="rounded-full bg-[#f2f2f7] px-3 py-1 text-xs font-bold text-[#6e6e73]">
                      {song.isPublic ? "Public" : "Private"}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={!ready}
                    onClick={handlePlay}
                    className="mt-7 rounded-full bg-[#fa233b] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:bg-[#d2d2d7]"
                  >
                    {ready ? "Play" : "Not ready yet"}
                  </button>
                </div>
              </section>

              <section className="mt-5 rounded-[2rem] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
                <p className="text-sm font-bold text-[#1d1d1f]">Audio info</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailField label="Duration" value={formatDuration(song.durationSec)} />
                  <DetailField label="Bitrate" value={song.bitrateKbps ? `${song.bitrateKbps} kbps` : "--"} />
                  <DetailField label="Codec" value={song.codec || "--"} />
                  <DetailField label="Format" value={song.format || "--"} />
                  <DetailField label="Created" value={formatDateTime(song.createdAt)} />
                  <DetailField label="Updated" value={formatDateTime(song.updatedAt)} />
                </div>
              </section>

              <details className="mt-5 rounded-2xl bg-white p-4 text-sm text-[#6e6e73] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
                <summary className="cursor-pointer font-bold text-[#1d1d1f]">
                  Technical asset path
                </summary>
                <p className="mt-3 break-all font-medium">
                  {song.encryptedFilePath || "Encrypted file is not available yet."}
                </p>
              </details>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

