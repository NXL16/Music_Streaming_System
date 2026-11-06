"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  createReport,
  getFileChecksum,
  getReportAttachmentContentType,
  REPORT_IMAGE_TYPES,
  type ReportKind,
  REPORT_VIDEO_TYPES,
  uploadReportAttachment,
} from "@/lib/reports/reports.api";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";

export const SHARED_FEEDBACK_OPEN_EVENT = "shared-feedback:open";

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ATTACHMENT_SLOTS = Array.from(
  { length: MAX_ATTACHMENTS },
  (_, index) => index,
);
type Attachment = {
  id: string;
  slot: number;
  file: File;
  previewUrl: string;
  checksum?: string;
  contentType: string;
};

function getAttachmentError(files: File[]) {
  if (files.length > MAX_ATTACHMENTS) {
    return `You can attach up to ${MAX_ATTACHMENTS} files.`;
  }

  if (
    files.filter((file) =>
      REPORT_VIDEO_TYPES.has(getReportAttachmentContentType(file)),
    ).length > 1
  ) {
    return "You can attach one video at most.";
  }

  for (const file of files) {
    const contentType = getReportAttachmentContentType(file);
    if (REPORT_IMAGE_TYPES.has(contentType) && file.size <= MAX_IMAGE_BYTES)
      continue;
    if (REPORT_VIDEO_TYPES.has(contentType) && file.size <= MAX_VIDEO_BYTES)
      continue;

    if (REPORT_IMAGE_TYPES.has(contentType))
      return `${file.name} must be 5 MB or smaller.`;
    if (REPORT_VIDEO_TYPES.has(contentType))
      return `${file.name} must be 50 MB or smaller.`;
    return `${file.name} has an unsupported file type.`;
  }

  return null;
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function SharedFeedbackDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<ReportKind | null>(null);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isPreparingAttachment, setIsPreparingAttachment] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const attachmentsRef = useRef<Attachment[]>([]);
  const selectedSlotRef = useRef<number | null>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      );
    },
    [],
  );

  const clearAttachments = useCallback(() => {
    attachmentsRef.current.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl),
    );
    setAttachments([]);
  }, []);

  const reset = useCallback(() => {
    setType(null);
    setContent("");
    clearAttachments();
    setError("");
    setSubmitting(false);
    setIsDialogVisible(false);
  }, [clearAttachments]);

  useEffect(() => {
    const open = () => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;

      reset();
      dialog.showModal();
      // Commit the initial visual state before changing it. The transition is
      // deliberately applied to the content layer instead of the native dialog
      // top-layer, whose transform behaviour differs between browsers.
      void dialog.offsetHeight;
      window.requestAnimationFrame(() => {
        setIsDialogVisible(true);
      });
    };

    window.addEventListener(SHARED_FEEDBACK_OPEN_EVENT, open);
    return () => window.removeEventListener(SHARED_FEEDBACK_OPEN_EVENT, open);
  }, [reset]);

  const close = () => {
    if (!submitting) dialogRef.current?.close();
  };

  const addFile = async (file: File, slot: number) => {
    const contentType = getReportAttachmentContentType(file);
    const nextFiles = [
      ...attachments
        .filter((attachment) => attachment.slot !== slot)
        .map((attachment) => attachment.file),
      file,
    ];
    const validationError = getAttachmentError(nextFiles);
    if (validationError) {
      setError(validationError);
      return;
    }

    const checksum = REPORT_IMAGE_TYPES.has(contentType)
      ? await getFileChecksum(file)
      : undefined;
    const isDuplicateImage = attachmentsRef.current.some(
      (attachment) =>
        attachment.slot !== slot && attachment.checksum === checksum,
    );
    if (checksum && isDuplicateImage) {
      setError("This image has already been added.");
      return;
    }

    setAttachments((current) => {
      const replacedAttachment = current.find(
        (attachment) => attachment.slot === slot,
      );
      if (replacedAttachment)
        URL.revokeObjectURL(replacedAttachment.previewUrl);

      return [
        ...current.filter((attachment) => attachment.slot !== slot),
        {
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          slot,
          file,
          previewUrl: URL.createObjectURL(file),
          checksum,
          contentType,
        },
      ].sort((left, right) => left.slot - right.slot);
    });
    setError("");
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const slot = selectedSlotRef.current;
    const file = event.target.files?.[0];
    event.target.value = "";

    if (slot !== null && file) {
      setIsPreparingAttachment(true);
      try {
        await addFile(file, slot);
      } finally {
        setIsPreparingAttachment(false);
      }
    }
    selectedSlotRef.current = null;
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
      return current.filter((item) => item.id !== attachmentId);
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = content.trim();
    if (!type || !message || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const attachmentIds = await Promise.all(
        attachments.map((attachment) =>
          uploadReportAttachment(attachment.file, attachment.checksum),
        ),
      );
      await createReport({
        type,
        content: message,
        attachmentIds,
        pageUrl: window.location.href,
        clientContext: {
          language: navigator.language,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        },
      });
      dialogRef.current?.close();
      notifyMenuSuccess(
        type === "ISSUE" ? "Issue report sent" : "Feedback sent",
      );
    } catch (submitError) {
      const message = getApiErrorMessage(
        submitError,
        "Couldn't send your report. Please try again.",
      );
      setError(message);
      notifyMenuError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="shared-feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!type) close();
      }}
      onClose={reset}
      onClick={(event) => {
        if (!type && event.target === event.currentTarget) close();
      }}
      className={`m-auto w-[calc(100%-32px)] ${type ? "max-w-120" : "max-w-80"} overflow-visible border-0 bg-transparent p-0 text-(--systemPrimary) backdrop:bg-black/50 max-[483px]:mb-0 max-[483px]:w-full max-[483px]:max-w-none`}
    >
      <div
        className="overflow-hidden rounded-2xl border border-(--labelDivider) bg-(--systemStandardThickMaterialSover-default_IC) shadow-2xl will-change-transform max-[483px]:rounded-b-none"
        style={{
          opacity: isDialogVisible ? 1 : 0,
          transform: isDialogVisible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 200ms ease-out, transform 200ms ease-out",
        }}
      >
        <div className="p-5 sm:p-6">
          <div
            className={
              type
                ? "mb-6 grid grid-cols-[1fr_auto] items-start gap-5"
                : "mb-8 text-center"
            }
          >
            <div className={type ? "min-w-0 space-y-1.5" : ""}>
              <h2
                id="shared-feedback-title"
                className={
                  type
                    ? "text-xl leading-6 font-semibold tracking-[-0.01em]"
                    : "text-[16px] leading-6 font-semibold tracking-[-0.01em]"
                }
              >
                {type === "ISSUE"
                  ? "Report an issue"
                  : type === "FEEDBACK"
                    ? "Share feedback"
                    : "Share your feedback with us"}
              </h2>
              {type && (
                <p className="max-w-100 text-sm leading-5 text-(--systemSecondary)">
                  {type
                    ? "Your report is sent directly to the team."
                    : "Help us improve Music by reporting an issue or sharing an idea."}
                </p>
              )}
            </div>
            {type && (
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                aria-label="Close"
                className="grid size-10 place-items-center rounded-full text-(--systemSecondary) transition-colors hover:bg-(--systemQuinary) hover:text-(--systemPrimary)"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M1.2 18C.6 18 0 17.5 0 16.8c0-.4.1-.6.4-.8l7-7-7-7c-.3-.2-.4-.5-.4-.8C0 .5.6 0 1.2 0c.3 0 .6.1.8.3l7 7 7-7c.2-.2.5-.3.8-.3.6 0 1.2.5 1.2 1.2 0 .3-.1.6-.4.8l-7 7 7 7c.2.2.4.5.4.8 0 .7-.6 1.2-1.2 1.2-.3 0-.6-.1-.8-.3l-7-7-7 7c-.2.1-.5.3-.8.3z"
                  ></path>
                </svg>
              </button>
            )}
          </div>

          {!type ? (
            <div className="grid grid-cols-2 justify-items-center gap-9 px-6 sm:gap-12">
              <button
                type="button"
                onClick={() => setType("ISSUE")}
                className="group grid justify-items-center gap-3 text-center"
              >
                <span className="relative grid size-16 place-items-center rounded-full before:absolute before:inset-0 before:rounded-full before:bg-(--systemQuinary) before:transition-opacity group-hover:before:opacity-65">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 32 32"
                    className="relative size-7 fill-none stroke-(--systemPrimary)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15.8 4.2 3.6 26h24.8L16.2 4.2a.24.24 0 0 0-.4 0Z" />
                    <path d="M16 12v6.5M16 23h.01" />
                  </svg>
                </span>
                <span className="text-sm font-semibold">Issue</span>
              </button>
              <button
                type="button"
                onClick={() => setType("FEEDBACK")}
                className="group grid justify-items-center gap-3 text-center"
              >
                <span className="relative grid size-16 place-items-center rounded-full before:absolute before:inset-0 before:rounded-full before:bg-(--systemQuinary) before:transition-opacity group-hover:before:opacity-65">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 32 32"
                    className="relative size-7 fill-none stroke-(--systemPrimary)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 6.5h22v15H18l-5.7 4.4v-4.4H5z" />
                    <path d="M11 13h.01M16 13h.01M21 13h.01" />
                  </svg>
                </span>
                <span className="text-sm font-semibold">Feedback</span>
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Description
                <span className="relative block">
                  <textarea
                    required
                    autoFocus
                    value={content}
                    maxLength={1000}
                    onChange={(event) => {
                      setContent(event.target.value);
                      resizeTextarea(event.currentTarget);
                    }}
                    placeholder={
                      type === "ISSUE"
                        ? "Tell us what happened and what you expected."
                        : "Tell us what you think."
                    }
                    className="min-h-30 w-full resize-none overflow-hidden rounded-lg border border-(--labelDivider) bg-transparent px-3 py-2 pb-7 font-normal outline-none focus:border-(--keyColor)"
                  />
                  <span className="pointer-events-none absolute bottom-3 right-3 text-xs font-normal text-(--systemSecondary)">
                    {1000 - content.length}
                  </span>
                </span>
              </label>

              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="report-attachments"
                    >
                      Attachments
                      <span className="font-normal text-(--systemSecondary)">
                        (optional)
                      </span>
                    </label>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label="Attachment requirements"
                        className="w-3.5 h-3.75 text-(--systemSecondary) transition-colors hover:text-(--systemPrimary)"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          className="inline-block align-baseline"
                        >
                          <path
                            fill="currentColor"
                            d="M8 16c1.093 0 2.122-.21 3.086-.627a8.178 8.178 0 0 0 2.553-1.734 8.178 8.178 0 0 0 1.734-2.553A7.674 7.674 0 0 0 16 8c0-1.093-.21-2.122-.627-3.086a8.178 8.178 0 0 0-1.734-2.553A8.165 8.165 0 0 0 11.082.627 7.702 7.702 0 0 0 7.992 0C6.9 0 5.871.21 4.906.627A8.21 8.21 0 0 0 .628 4.913 7.674 7.674 0 0 0 0 8c0 1.093.21 2.122.627 3.086a8.178 8.178 0 0 0 1.734 2.553 8.178 8.178 0 0 0 2.553 1.734A7.674 7.674 0 0 0 8 16Zm0-1.333a6.52 6.52 0 0 1-2.596-.518 6.707 6.707 0 0 1-2.122-1.431 6.653 6.653 0 0 1-1.427-2.122A6.563 6.563 0 0 1 1.34 8c0-.925.171-1.79.514-2.596a6.731 6.731 0 0 1 1.423-2.126 6.563 6.563 0 0 1 4.714-1.945c.926 0 1.791.172 2.596.514a6.72 6.72 0 0 1 3.56 3.557A6.52 6.52 0 0 1 14.668 8c0 .925-.172 1.79-.514 2.596a6.653 6.653 0 0 1-1.428 2.122 6.694 6.694 0 0 1-2.125 1.431 6.548 6.548 0 0 1-2.6.518Zm-1.373-2.353H9.82a.569.569 0 0 0 .407-.157.52.52 0 0 0 .165-.392.52.52 0 0 0-.165-.392.569.569 0 0 0-.407-.157h-.973V7.224c0-.215-.052-.386-.157-.514-.104-.128-.256-.192-.455-.192H6.761a.569.569 0 0 0-.408.157.52.52 0 0 0-.165.392.52.52 0 0 0 .165.392c.11.104.246.157.408.157H7.6v3.6h-.973a.569.569 0 0 0-.407.157.52.52 0 0 0-.165.392.52.52 0 0 0 .165.392c.11.104.245.157.407.157ZM7.93 5.208c.288 0 .53-.1.726-.298a.99.99 0 0 0 .294-.722.999.999 0 0 0-.294-.73.98.98 0 0 0-.726-.297c-.282 0-.522.1-.721.298a.992.992 0 0 0-.298.73c0 .282.1.522.298.72.199.2.44.299.721.299Z"
                          ></path>
                        </svg>
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-(--labelDivider) bg-(--systemStandardThickMaterialSover-default_IC) px-3 py-2 text-xs leading-5 text-(--systemSecondary) opacity-0 shadow-lg transition-opacity group-hover:opacity-100 pointer-coarse:group-focus-within:opacity-100"
                      >
                        JPEG, PNG, WebP or AVIF up to 5 MB each. One MP4, MOV or
                        WebM video up to 50 MB.
                      </span>
                    </span>
                  </div>
                  <span className="text-xs text-(--systemSecondary)">
                    {attachments.length}/{MAX_ATTACHMENTS}
                  </span>
                </div>
                <input
                  id="report-attachments"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,video/webm,.mov"
                  onChange={selectFile}
                  disabled={submitting || isPreparingAttachment}
                  className="sr-only"
                />
                <div className="flex flex-wrap gap-2">
                  {ATTACHMENT_SLOTS.map((slot) => {
                    const attachment = attachments.find(
                      (item) => item.slot === slot,
                    );

                    return (
                      <div
                        key={slot}
                        className={`group relative size-18 overflow-hidden rounded-lg ${attachment ? "border border-(--labelDivider) bg-(--systemQuinary)" : "border border-dashed border-(--labelDivider) bg-(--systemQuinary) transition-colors hover:border-(--keyColor) hover:bg-[#ff375f14]"}`}
                      >
                        {attachment ? (
                          <>
                            {REPORT_IMAGE_TYPES.has(attachment.contentType) ? (
                              <Image
                                unoptimized
                                src={attachment.previewUrl}
                                alt={`Attachment ${slot + 1}`}
                                width={160}
                                height={160}
                                className="size-full object-cover"
                              />
                            ) : (
                              <>
                                <video
                                  src={attachment.previewUrl}
                                  muted
                                  preload="metadata"
                                  className="size-full object-cover"
                                />
                                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] leading-none font-semibold tracking-[0.08em] text-white">
                                  VIDEO
                                </span>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => removeAttachment(attachment.id)}
                              className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/65 text-xs text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label={`Remove attachment ${slot + 1}`}
                            >
                              &times;
                            </button>
                          </>
                        ) : (
                          <label
                            htmlFor="report-attachments"
                            onClick={() => {
                              selectedSlotRef.current = slot;
                            }}
                            className={`grid size-full cursor-pointer place-items-center text-(--systemSecondary) transition-colors group-hover:text-(--keyColor) ${submitting || isPreparingAttachment ? "pointer-events-none opacity-50" : ""}`}
                            aria-label={`Add attachment ${slot + 1}`}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              className="size-5 fill-none stroke-current"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            >
                              <path d="M8 3.25v9.5M3.25 8h9.5" />
                            </svg>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-(--keyColor)">
                  {error}
                </p>
              )}

              <div
                className={`flex items-center justify-between gap-3 ${error ? "" : "mt-6"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setType(null);
                    setError("");
                  }}
                  disabled={submitting}
                  className="text-sm"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !content.trim()}
                  className="rounded-full bg-(--keyColor) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </dialog>
  );
}
