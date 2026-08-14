import { toast } from "sonner";
import { createElement } from "react";
import { UndoCountdown } from "@/components/notifications/undo-countdown";
import type { LibraryResourceInput } from "@/lib/library/library-resources.api";
import {
  beginLibraryResourceRemoval,
  LIBRARY_REMOVAL_UNDO_DURATION_MS,
} from "@/lib/library/library-resources.api";
import { scheduleRealtimeExpiry } from "@/lib/notifications/realtime-expiry";

const STANDARD_TOAST_DURATION = 3_000;

function showTimedToast(
  showToast: (
    message: string,
    options: { duration: number },
  ) => string | number,
  message: string,
) {
  const expiresAt = Date.now() + STANDARD_TOAST_DURATION;
  const toastId = showToast(message, { duration: STANDARD_TOAST_DURATION });
  scheduleRealtimeExpiry(expiresAt, () => toast.dismiss(toastId));
}

export function notifyMenuSuccess(message: string) {
  showTimedToast(toast.success, message);
}

export function notifyMenuError(message: string) {
  showTimedToast(toast.error, message);
}

export async function confirmLibraryRemoval(
  input: LibraryResourceInput,
  sourceId?: string,
) {
  const duration = LIBRARY_REMOVAL_UNDO_DURATION_MS;
  const expiresAt = Date.now() + duration;
  const removal = await beginLibraryResourceRemoval(input, sourceId, expiresAt);
  let settled = false;
  let cancelExpiry = () => {};

  const commit = () => {
    if (settled) return;
    settled = true;
    cancelExpiry();
    toast.dismiss(toastId);
    void removal.commit().catch(() => {
      notifyMenuError("Couldn't delete from Library");
    });
  };

  const toastId = toast(createElement(UndoCountdown, { duration }), {
    duration,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled || Date.now() >= expiresAt) return;
        settled = true;
        cancelExpiry();
        removal.undo();
      },
    },
  });

  removal.onUndo(() => {
    settled = true;
    cancelExpiry();
    toast.dismiss(toastId);
  });

  cancelExpiry = scheduleRealtimeExpiry(expiresAt, commit);
}
