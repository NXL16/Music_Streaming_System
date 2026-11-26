"use client";

import type { FormEvent, RefObject } from "react";

type PlaylistFormDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  heading: string;
  title: string;
  description: string;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

/**
 * Shared compact modal form for creating and editing user playlists.
 */
export function PlaylistFormDialog({
  dialogRef,
  heading,
  title,
  description,
  submitting,
  submitLabel,
  submittingLabel,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: PlaylistFormDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(310px,calc(100vw-2rem))] overflow-hidden rounded-[12px] border border-(--labelDivider) bg-(--systemStandardThickMaterialSover-default_IC) p-0 text-(--systemPrimary) shadow-2xl backdrop-blur-xl backdrop:bg-black/45"
    >
      <form onSubmit={onSubmit} className="grid">
        <h2 className="px-5 pt-4 pb-4 text-center text-[15px] font-semibold leading-tight text-(--systemPrimary)">
          {heading}
        </h2>

        <div className="grid gap-2.5 px-4 pb-5">
          <input
            required
            autoFocus
            aria-label="Playlist Title"
            placeholder="Playlist Title"
            value={title}
            maxLength={32}
            onChange={(event) => onTitleChange(event.target.value.slice(0, 32))}
            className="mt-5 w-full rounded-[6px] border border-(--labelDivider) bg-(--systemQuinary) px-2.5 py-1.5 text-base text-(--systemPrimary) placeholder:text-(--systemSecondary) outline-none transition-colors focus:border-(--systemSecondary) md:text-[13px]"
          />
          <textarea
            aria-label="Description (optional)"
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="min-h-[66px] w-full resize-none rounded-[6px] border border-(--labelDivider) bg-(--systemQuinary) px-2.5 py-2 text-base text-(--systemPrimary) placeholder:text-(--systemSecondary) outline-none transition-colors focus:border-(--systemSecondary) md:text-[13px]"
          />
        </div>

        <div className="flex items-center justify-between border-t border-(--labelDivider) px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-w-[96px] rounded-[6px] border border-(--labelDivider) bg-transparent px-4 py-1.5 text-[13px] font-medium text-(--systemPrimary) transition-colors hover:bg-(--systemQuinary) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="min-w-[96px] rounded-[6px] bg-(--systemPrimary) px-4 py-1.5 text-[13px] font-medium text-(--pageBG) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-(--systemQuaternary) disabled:text-(--systemSecondary) disabled:hover:opacity-100"
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
