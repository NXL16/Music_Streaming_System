"use client";

import { useEffect, useRef, useState } from "react";
import type { CollectionMenuContext } from "@/lib/context-menu/types";
import { EDIT_PLAYLIST_DIALOG_EVENT } from "@/lib/playlists/edit-playlist-dialog";
import { updateUserPlaylist } from "@/lib/playlists/user-playlists.api";
import { updateRecentlyPlayedPlaylistSnapshot } from "@/lib/recommendations/recently-played-snapshot";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";

export function EditPlaylistDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [playlist, setPlaylist] = useState<CollectionMenuContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      const nextPlaylist = (event as CustomEvent<CollectionMenuContext>).detail;
      setPlaylist(nextPlaylist);
      setTitle(nextPlaylist.title);
      setDescription(nextPlaylist.description || "");
      dialogRef.current?.showModal();
    };
    window.addEventListener(EDIT_PLAYLIST_DIALOG_EVENT, open);
    return () => window.removeEventListener(EDIT_PLAYLIST_DIALOG_EVENT, open);
  }, []);

  const close = () => {
    if (submitting) return;
    dialogRef.current?.close();
    setPlaylist(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!playlist || !title.trim() || submitting) return;

    setSubmitting(true);
    try {
      await updateUserPlaylist(playlist.resourceId, {
        name: title.trim(),
        description: description.trim(),
        userId: playlist.userId,
      });
      updateRecentlyPlayedPlaylistSnapshot({
        playlistId: playlist.resourceId,
        title: title.trim(),
      });
      dialogRef.current?.close();
      setPlaylist(null);
      notifyMenuSuccess("Playlist updated");
    } catch (error) {
      console.error("[playlist] edit", error);
      notifyMenuError("Couldn't update playlist");
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
      <form onSubmit={save} className="grid gap-4">
        <h2 className="text-lg font-semibold">Edit Playlist</h2>
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
          <span className="text-end text-xs text-white/50">{title.length}/32</span>
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
            {submitting ? "Saving…" : "Done"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
