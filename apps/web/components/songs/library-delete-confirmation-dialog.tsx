"use client";

import { useEffect, useRef } from "react";
import type { LibraryResourceType } from "@/lib/library/library-resources.api";

function resourceLabel(resourceType: LibraryResourceType) {
  switch (resourceType) {
    case "albums":
      return "album";
    case "playlists":
      return "playlist";
    case "songs":
      return "song";
  }
}

type LibraryDeleteConfirmationDialogProps = {
  open: boolean;
  resourceType: LibraryResourceType;
  onConfirm: () => void;
  onCancel: () => void;
  submitting?: boolean;
};

export function LibraryDeleteConfirmationDialog({
  open,
  resourceType,
  onConfirm,
  onCancel,
  submitting = false,
}: LibraryDeleteConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-80 rounded-xl border border-white/20 bg-(--background) p-4 text-center text-(--systemPrimary) shadow-2xl backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 className="text-base font-bold">Delete from Library</h2>
      <p className="mt-3 text-sm text-neutral-200">
        Are you sure you want to delete this {resourceLabel(resourceType)} from
        your library?
      </p>
      <button
        className="mt-4 w-full rounded-lg bg-[#e60018] py-2.5 font-bold disabled:opacity-60"
        onClick={onConfirm}
        type="button"
        disabled={submitting}
      >
        OK
      </button>
      <button
        className="mt-2 w-full rounded-lg bg-neutral-400 py-2.5 font-bold disabled:opacity-60"
        onClick={onCancel}
        type="button"
        disabled={submitting}
      >
        Cancel
      </button>
    </dialog>
  );
}
