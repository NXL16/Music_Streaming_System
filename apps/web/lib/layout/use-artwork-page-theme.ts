import { useLayoutEffect, useState } from "react";
import {
  extractArtworkThemeColor,
  getCachedArtworkThemeColor,
} from "@/lib/media/extract-artwork-theme-color";
import { usePageThemeStore } from "./use-page-theme-store";

type UseArtworkPageThemeOptions = {
  sourceKey: string;
  /** Final normalized page color persisted as artwork.bgColor. */
  baseColor?: string;
  artworkUrl?: string;
  enabled?: boolean;
};

function normalizeThemeColor(color: string | undefined) {
  const value = color?.replace(/^#/, "").trim();
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
}

/** Resolves an artwork palette once and applies it to the shared page theme. */
export function useArtworkPageTheme({
  sourceKey,
  baseColor,
  artworkUrl,
  enabled = true,
}: UseArtworkPageThemeOptions) {
  const setPageTheme = usePageThemeStore((state) => state.setTheme);
  const clearPageTheme = usePageThemeStore((state) => state.clearTheme);
  const persistedColor = normalizeThemeColor(baseColor);
  const resolvedColor =
    persistedColor ??
    (artworkUrl ? getCachedArtworkThemeColor(artworkUrl) : undefined);
  const requestKey = `${sourceKey}:${baseColor ?? ""}:${artworkUrl ?? ""}`;
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!enabled) {
      clearPageTheme(sourceKey);
      return;
    }

    if (resolvedColor !== undefined) {
      if (resolvedColor) setPageTheme(sourceKey, resolvedColor);
      else clearPageTheme(sourceKey);
      return () => clearPageTheme(sourceKey);
    }

    if (!artworkUrl) {
      clearPageTheme(sourceKey);
      return;
    }

    let cancelled = false;
    void extractArtworkThemeColor(artworkUrl)
      .then((color) => {
        if (cancelled) return;
        if (color) setPageTheme(sourceKey, color);
        else clearPageTheme(sourceKey);
        setResolvedRequestKey(requestKey);
      })
      .catch(() => {
        if (cancelled) return;
        clearPageTheme(sourceKey);
        setResolvedRequestKey(requestKey);
      });

    return () => {
      cancelled = true;
      clearPageTheme(sourceKey);
    };
  }, [
    artworkUrl,
    clearPageTheme,
    enabled,
    requestKey,
    setPageTheme,
    sourceKey,
    resolvedColor,
  ]);

  return {
    isLoading:
      enabled &&
      resolvedColor === undefined &&
      Boolean(artworkUrl) &&
      resolvedRequestKey !== requestKey,
  };
}
