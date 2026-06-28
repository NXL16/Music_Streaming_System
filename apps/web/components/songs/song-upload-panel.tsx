"use client";

import { useSongUpload } from "@/lib/songs/use-song-upload";

type SongUploadPanelProps = {
  onUploaded?: () => void;
  compact?: boolean;
};

const stepLabel = {
  idle: "Ready",
  hashing: "Calculating checksum...",
  requesting: "Preparing upload...",
  uploading: "Uploading file...",
  waiting: "Waiting for processing...",
  done: "Done",
  error: "Upload failed",
} as const;

export function SongUploadPanel({ onUploaded, compact = false }: SongUploadPanelProps) {
  const upload = useSongUpload({ onUploaded });

  return (
    <section className={compact ? "" : "rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea] md:p-8"}>
      {!compact ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
            Upload
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-[#1d1d1f]">
            Upload a song
          </h2>
          <p className="mt-3 leading-7 text-[#6e6e73]">
            Choose an audio file, add display metadata, then upload it to your
            library.
          </p>
        </div>
      ) : null}

      <form onSubmit={upload.handleSubmit} className={compact ? "space-y-4" : "mt-6 space-y-4"}>
        <div>
          <label className="block text-sm font-semibold text-[#1d1d1f]">Audio file</label>
          <input
            type="file"
            accept="audio/*"
            disabled={upload.loading}
            onChange={(event) =>
              upload.selectFile(event.target.files?.[0] ?? null)
            }
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm outline-none ring-1 ring-[#d2d2d7] file:mr-4 file:rounded-full file:border-0 file:bg-[#fa233b] file:px-4 file:py-2 file:font-bold file:text-white focus:ring-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-[#1d1d1f]">Title</label>
            <input
              value={upload.form.title}
              onChange={(event) => upload.updateField("title", event.target.value)}
              disabled={upload.loading}
              className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1d1d1f]">Artist</label>
            <input
              value={upload.form.artist}
              onChange={(event) =>
                upload.updateField("artist", event.target.value)
              }
              disabled={upload.loading}
              placeholder="Unknown artist"
              className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-[#1d1d1f]">Album</label>
            <input
              value={upload.form.album}
              onChange={(event) => upload.updateField("album", event.target.value)}
              disabled={upload.loading}
              className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-4 py-3 font-semibold text-[#1d1d1f] ring-1 ring-[#d2d2d7]">
            <input
              type="checkbox"
              checked={upload.form.isPublic}
              disabled={upload.loading}
              onChange={(event) =>
                upload.updateField("isPublic", event.target.checked)
              }
              className="h-5 w-5 accent-[#fa233b]"
            />
            Public song
          </label>
        </div>

        {upload.error ? (
          <div className="rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
            {upload.error}
          </div>
        ) : null}

        {upload.step !== "idle" ? (
          <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm font-semibold text-[#6e6e73] ring-1 ring-[#e5e5ea]">
            {stepLabel[upload.step]}
            {upload.status ? ` - ${upload.status}` : ""}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={upload.reset}
            disabled={upload.loading}
            className="rounded-full bg-[#f2f2f7] px-5 py-2.5 text-sm font-bold text-[#1d1d1f] transition hover:bg-[#e5e5ea] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset
          </button>

          <button
            type="submit"
            disabled={upload.loading}
            className="rounded-full bg-[#fa233b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {upload.loading ? "Uploading..." : "Upload song"}
          </button>
        </div>
      </form>
    </section>
  );
}
