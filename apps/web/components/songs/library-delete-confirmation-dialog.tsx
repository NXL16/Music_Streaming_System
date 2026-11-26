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
      className="m-auto w-[min(320px,calc(100vw-2rem))] rounded-[10px] border-[0.5px] border-black/20 bg-(--systemStandardThickMaterialSover-default_IC) px-4 pt-5 pb-4 text-center text-(--systemPrimary) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2),0_8px_40px_var(--dialogShadowColor,rgba(0,0,0,0.45))] backdrop-blur-[60px] backdrop-saturate-[210%] backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 className="text-[15px] font-bold leading-tight text-(--systemPrimary)">
        Delete from Library
      </h2>
      <p className="mt-2.5 text-[13px] leading-[1.4] text-(--systemPrimary)/90">
        Are you sure you want to delete this {resourceLabel(resourceType)} from
        your library?
      </p>
      <button
        className="mt-4 w-full rounded-[6px] bg-(--systemPrimary) py-2 text-[13px] font-semibold text-(--pageBG) transition-opacity hover:opacity-90 disabled:opacity-60"
        onClick={onConfirm}
        type="button"
        disabled={submitting}
      >
        OK
      </button>
      <button
        className="mt-2 w-full rounded-[6px] bg-(--systemQuaternary) py-2 text-[13px] font-semibold text-(--systemPrimary) transition-opacity hover:opacity-85 disabled:opacity-60"
        onClick={onCancel}
        type="button"
        disabled={submitting}
      >
        Cancel
      </button>
    </dialog>
  );
}
