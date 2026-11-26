"use client";

import { useEffect, useRef, useState } from "react";
import type { CollectionMenuContext } from "@/lib/context-menu/types";
import { EDIT_PLAYLIST_DIALOG_EVENT } from "@/lib/playlists/edit-playlist-dialog";
import { updateUserPlaylist } from "@/lib/playlists/user-playlists.api";
import { updateRecentlyPlayedPlaylistSnapshot } from "@/lib/recommendations/recently-played-snapshot";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { PlaylistFormDialog } from "./playlist-form-dialog";

export function EditPlaylistDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [playlist, setPlaylist] = useState<CollectionMenuContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useHydrated();

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

  if (!hydrated) return null;

  return (
    <PlaylistFormDialog
      dialogRef={dialogRef}
      heading="Edit Playlist"
      title={title}
      description={description}
      submitting={submitting}
      submitLabel="Done"
      submittingLabel="Saving…"
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onClose={close}
      onSubmit={save}
    />
  );
}
