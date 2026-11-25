import { useEffect } from "react";

/** Sets `document.title` when non-empty and restores the previous title on unmount. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const trimmed = title?.trim();
    if (!trimmed) return;

    const previousTitle = document.title;
    document.title = trimmed;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
