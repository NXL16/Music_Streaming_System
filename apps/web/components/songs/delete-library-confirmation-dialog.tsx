"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LibraryResourceInput } from "@/lib/library/library-resources.api";
import { DELETE_LIBRARY_CONFIRMATION_EVENT } from "@/lib/library/delete-library-confirmation-dialog";
import { LibraryDeleteConfirmationDialog } from "./library-delete-confirmation-dialog";
import {
  confirmLibraryRemoval,
  notifyMenuError,
} from "@/lib/notifications/menu-toast";

export function DeleteLibraryConfirmationDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const [resource, setResource] = useState<LibraryResourceInput | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      setResource((event as CustomEvent<LibraryResourceInput>).detail);
    };

    window.addEventListener(DELETE_LIBRARY_CONFIRMATION_EVENT, open);
    return () =>
      window.removeEventListener(DELETE_LIBRARY_CONFIRMATION_EVENT, open);
  }, []);

  const close = () => {
    if (submitting) return;
    setResource(null);
  };

  const removeFromLibrary = async () => {
    if (!resource || submitting) return;

    setSubmitting(true);
    try {
      await confirmLibraryRemoval(resource);
      if (
        resource.sourceOrigin === "user-playlist" &&
        pathname === `/library/playlist/${encodeURIComponent(resource.resourceId)}`
      ) {
        router.replace("/home");
      }
      setResource(null);
    } catch (error) {
      console.error("[library] delete resource", error);
      notifyMenuError("Couldn't delete from Library");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LibraryDeleteConfirmationDialog
      open={Boolean(resource)}
      resourceType={resource?.resourceType ?? "playlists"}
      onConfirm={() => void removeFromLibrary()}
      onCancel={close}
      submitting={submitting}
    />
  );
}
