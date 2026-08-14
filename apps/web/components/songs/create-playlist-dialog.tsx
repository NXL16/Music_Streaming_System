"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { CREATE_PLAYLIST_DIALOG_EVENT } from "@/lib/playlists/create-playlist-dialog";
import { resolvePlaylistSource } from "@/lib/playlists/resolve-playlist-source";
import { createUserPlaylistFromSource } from "@/lib/playlists/user-playlists.api";
import { uploadGeneratedPlaylistCover } from "@/lib/playlists/generated-playlist-cover";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";

export function CreatePlaylistDialog() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.userId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<ContextMenuContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      setSource((event as CustomEvent<ContextMenuContext>).detail);
      setTitle("");
      setDescription("");
      dialogRef.current?.showModal();
    };
    window.addEventListener(CREATE_PLAYLIST_DIALOG_EVENT, open);
    return () => window.removeEventListener(CREATE_PLAYLIST_DIALOG_EVENT, open);
  }, []);

  const close = () => {
    if (submitting) return;
    dialogRef.current?.close();
    setSource(null);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!source || !title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data = await createUserPlaylistFromSource({
        name: title.trim(),
        description: description.trim(),
        source: await resolvePlaylistSource(source),
        userId,
      });
      try {
        await uploadGeneratedPlaylistCover(data.id);
      } catch (coverError) {
        // The playlist itself is already durable. Do not report creation as a
        // failure when a transient upload/CORS issue prevents its cover.
        console.error("[playlist] generated cover", coverError);
        notifyMenuError(
          "Playlist created, but its cover couldn't be generated",
        );
      }
      dialogRef.current?.close();
      notifyMenuSuccess("Playlist created");
      router.push(`/library/playlist/${data.id}`);
    } catch (error) {
      console.error("[playlist] create", error);
      notifyMenuError("Couldn't create playlist");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-full max-w-100 rounded-xl border border-white/20 bg-[#242424] p-5 text-white shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={create} className="grid gap-4">
        <h2 className="text-lg font-semibold">New Playlist</h2>
        <label className="grid gap-1 text-sm">
          Title
          <input
            required
            autoFocus
            value={title}
            maxLength={32}
            onChange={(event) => setTitle(event.target.value.slice(0, 32))}
            className="rounded-md border border-white/15 bg-black/20 px-3 py-2 outline-none"
          />
          <span className="text-end text-xs text-white/50">
            {title.length}/32
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          Description <span className="text-white/50">(optional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-20 rounded-md border border-white/15 bg-black/20 px-3 py-2 outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
