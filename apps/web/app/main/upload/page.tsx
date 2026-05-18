"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  finalizeSongUpload,
  requestSongUpload,
  type RequestUploadResponse,
} from "@/lib/api";

const MAX_TITLE_LENGTH = 120;

type UploadStatus =
  | "idle"
  | "hashing"
  | "requesting"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(hash));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState<RequestUploadResponse | null>(null);

  const isBusy = status !== "idle" && status !== "done" && status !== "error";
  const canSubmit = Boolean(file && checksum && title.trim());

  const sizeLabel = useMemo(() => {
    if (!file) return "No file";
    return formatBytes(file.size);
  }, [file]);

  async function handleFileChange(inputFile: File | null) {
    setFile(inputFile);
    setChecksum(null);
    setMessage(null);
    setUploadInfo(null);
    setProgress(0);

    if (!inputFile) return;

    if (!title.trim()) {
      const baseName = inputFile.name.replace(/\.[^.]+$/, "");
      setTitle(baseName.slice(0, MAX_TITLE_LENGTH));
    }

    setStatus("hashing");
    try {
      const digest = await sha256Hex(inputFile);
      setChecksum(digest);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Failed to hash file.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setUploadInfo(null);

    if (!file || !checksum || !title.trim()) {
      setStatus("error");
      setMessage("Please provide a title and select a file.");
      return;
    }

    setStatus("requesting");

    try {
      const request = await requestSongUpload({
        title: title.trim(),
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        isPublic,
        checksum,
        size: file.size,
      });

      setUploadInfo(request);

      if (request.instant) {
        setStatus("done");
        setMessage("Song already exists. No upload needed.");
        return;
      }

      if (!request.uploadUrl) {
        throw new Error("Missing upload URL");
      }

      setStatus("uploading");
      setProgress(0);
      await uploadToPresignedUrl(request.uploadUrl, file, setProgress);

      setStatus("finalizing");
      await finalizeSongUpload({ songId: request.songId, checksum });

      setStatus("done");
      setProgress(100);
      setMessage("Upload complete. Processing started.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Upload failed. Please try again.");
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-96px)] overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-green-500/20 blur-3xl" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_45%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.4em] text-green-300/70">
            Upload Studio
          </p>
          <h1 className="text-3xl font-semibold leading-tight">
            Ship a track to the pipeline
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            We hash your audio, reserve a slot, then upload straight to the edge
            bucket. When it is done, processing kicks in automatically.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 shadow-[0_0_40px_rgba(16,185,129,0.08)] backdrop-blur"
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-widest text-zinc-400">
                  Audio File
                </label>
                <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-white/15 bg-zinc-950/60 px-4 py-6 text-center text-sm text-zinc-300 transition hover:border-green-400/60">
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) =>
                      void handleFileChange(event.target.files?.[0] ?? null)
                    }
                  />
                  <span className="text-base font-semibold text-white">
                    {file ? file.name : "Choose audio file"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {file ? sizeLabel : "MP3, WAV, FLAC supported"}
                  </span>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-zinc-400">
                    Title
                  </label>
                  <input
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value.slice(0, MAX_TITLE_LENGTH))
                    }
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                    placeholder="Untitled track"
                    disabled={isBusy}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-zinc-400">
                    Artist
                  </label>
                  <input
                    value={artist}
                    onChange={(event) => setArtist(event.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                    placeholder="Artist name"
                    disabled={isBusy}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-zinc-400">
                    Album
                  </label>
                  <input
                    value={album}
                    onChange={(event) => setAlbum(event.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                    placeholder="Album / EP"
                    disabled={isBusy}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-400">
                      Visibility
                    </p>
                    <p className="text-white">
                      {isPublic ? "Public" : "Private"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPublic((prev) => !prev)}
                    className={`h-8 w-14 rounded-full border border-white/10 p-1 transition ${
                      isPublic ? "bg-green-400" : "bg-zinc-700"
                    }`}
                    disabled={isBusy}
                    aria-label="Toggle visibility"
                  >
                    <span
                      className={`block h-6 w-6 rounded-full bg-black transition ${
                        isPublic ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-widest text-zinc-400">
                  Checksum
                </label>
                <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300">
                  {checksum ?? "Waiting for file"}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || isBusy}
                className="rounded-full bg-green-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "hashing"
                  ? "Hashing..."
                  : status === "requesting"
                    ? "Reserving slot..."
                    : status === "uploading"
                      ? "Uploading..."
                      : status === "finalizing"
                        ? "Finalizing..."
                        : "Upload"}
              </button>
            </div>
          </form>

          <aside className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 backdrop-blur">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-400">
                  Status
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {status === "idle" && "Ready"}
                  {status === "hashing" && "Hashing"}
                  {status === "requesting" && "Requesting"}
                  {status === "uploading" && "Uploading"}
                  {status === "finalizing" && "Finalizing"}
                  {status === "done" && "Done"}
                  {status === "error" && "Error"}
                </p>
                {message && (
                  <p className="mt-2 text-sm text-zinc-400">{message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-widest text-zinc-400">
                  Progress
                </p>
                <div className="h-2 w-full rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-green-400 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500">{progress}%</p>
              </div>

              <div className="grid gap-3 text-xs text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Song ID</span>
                  <span className="text-zinc-200">
                    {uploadInfo?.songId ?? "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Instant</span>
                  <span className="text-zinc-200">
                    {uploadInfo ? String(uploadInfo.instant) : "-"}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
