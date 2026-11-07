"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

type ContentDialogProps = {
  open: boolean;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  hideGradient?: boolean;
  onClose: () => void;
};

export function ContentDialog({
  open,
  title,
  subtitle,
  children,
  hideGradient = false,
  onClose,
}: ContentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="lyrics-box"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div
        className={`content-modal-container ${hideGradient ? "hide-gradient" : ""}`}
      >
        <div className="button-container">
          <button
            type="button"
            className="close-button"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="18" height="18" aria-hidden="true" viewBox="0 0 18 18">
              <path d="M1.2 18C.6 18 0 17.5 0 16.8c0-.4.1-.6.4-.8l7-7-7-7c-.3-.2-.4-.5-.4-.8C0 .5.6 0 1.2 0c.3 0 .6.1.8.3l7 7 7-7c.2-.2.5-.3.8-.3.6 0 1.2.5 1.2 1.2 0 .3-.1.6-.4.8l-7 7 7 7c.2.2.4.5.4.8 0 .7-.6 1.2-1.2 1.2-.3 0-.6-.1-.8-.3l-7-7-7 7c-.2.1-.5.3-.8.3" />
            </svg>
          </button>
        </div>

        <div className="header-container">
          <h1
            id={titleId}
            className="text-(--systemPrimary) [font:var(--title-1-emphasized)] p-[0_30px] min-[1000px]:[font:var(--large-title-emphasized)]"
          >
            {title}
          </h1>

          <h2 className="text-(--systemSecondary) [font:var(--body)] p-[0_30px]">
            {subtitle}
          </h2>
        </div>

        <div className="content-container">{children}</div>
      </div>
    </dialog>
  );
}
