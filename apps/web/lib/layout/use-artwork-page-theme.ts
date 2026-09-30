import { useEffect, useMemo, useState } from "react";
import { extractArtworkThemeColor } from "@/lib/media/extract-artwork-theme-color";
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
  const activeThemeSourceKey = usePageThemeStore((state) => state.sourceKey);
  const activeThemeBaseColor = usePageThemeStore((state) => state.baseColor);
  const persistedColor = normalizeThemeColor(baseColor);
  const requestKey = useMemo(
    () => `${sourceKey}:${baseColor ?? ""}:${artworkUrl ?? ""}`,
    [artworkUrl, baseColor, sourceKey],
  );
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) {
      clearPageTheme(sourceKey);
      return;
    }

    if (persistedColor) {
      setPageTheme(sourceKey, persistedColor);
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
    persistedColor,
  ]);

  return {
    isLoading:
      enabled &&
      (persistedColor
        ? activeThemeSourceKey !== sourceKey ||
          activeThemeBaseColor !== persistedColor
        : Boolean(artworkUrl) && resolvedRequestKey !== requestKey),
  };
}
