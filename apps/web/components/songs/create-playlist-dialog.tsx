"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { CREATE_PLAYLIST_DIALOG_EVENT } from "@/lib/playlists/create-playlist-dialog";
import { resolvePlaylistSource } from "@/lib/playlists/resolve-playlist-source";
import { createUserPlaylistFromSource } from "@/lib/playlists/user-playlists.api";
import { uploadGeneratedPlaylistCover } from "@/lib/playlists/generated-playlist-cover";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { PlaylistFormDialog } from "./playlist-form-dialog";

export function CreatePlaylistDialog() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.userId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<ContextMenuContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useHydrated();

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

  if (!hydrated) return null;

  return (
    <PlaylistFormDialog
      dialogRef={dialogRef}
      heading="New Playlist"
      title={title}
      description={description}
      submitting={submitting}
      submitLabel="Create"
      submittingLabel="Creating…"
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onClose={close}
      onSubmit={create}
    />
  );
}
