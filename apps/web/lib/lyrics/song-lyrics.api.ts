import { http } from "@/lib/api/http";
import { getCachedQuery } from "@/lib/api/query-cache";

export type LyricWord = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
};

export type LyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  vocalistType?: "PRIMARY" | "SECONDARY";
  kind?: "LYRIC" | "INSTRUMENTAL";
  words?: LyricWord[];
  backgroundWords?: LyricWord[];
};

const LYRICS_CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_INTERLUDE_GAP_MS = 7_000;

type AppleStyleLyricsResponse = {
  data?: Array<{
    attributes?: { ttmlLocalizations?: string };
  }>;
};

function parseTtmlTime(value: string | null): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number.parseFloat(normalized) * 1_000;
  }
  if (/^\d+(?:\.\d+)?ms$/.test(normalized)) {
    return Number.parseFloat(normalized);
  }
  if (/^\d+(?:\.\d+)?s$/.test(normalized)) {
    return Number.parseFloat(normalized) * 1_000;
  }
  const match = normalized.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return undefined;
  return (
    (Number(match[1] || 0) * 60 * 60 +
      Number(match[2]) * 60 +
      Number(match[3])) *
    1_000
  );
}

function addInferredInterludes(lines: LyricLine[]): LyricLine[] {
  const timeSortedLines = [...lines].sort(
    (left, right) =>
      left.startTimeMs - right.startTimeMs ||
      left.endTimeMs - right.endTimeMs ||
      left.position - right.position,
  );
  const linesWithInterludes: LyricLine[] = [];
  let maxEndTimeMs = 0;

  for (const [index, line] of timeSortedLines.entries()) {
    const gapEndTimeMs = Math.max(maxEndTimeMs, line.startTimeMs);
    if (gapEndTimeMs - maxEndTimeMs >= MIN_INTERLUDE_GAP_MS) {
      linesWithInterludes.push({
        // Interludes are display-only and cannot be clicked to seek, so their
        // position must not overlap an authored lyric line position.
        position: -index - 1,
        startTimeMs: maxEndTimeMs,
        endTimeMs: gapEndTimeMs,
        text: "",
        kind: "INSTRUMENTAL",
      });
    }

    linesWithInterludes.push(line);
    maxEndTimeMs = Math.max(maxEndTimeMs, line.endTimeMs);
  }

  return linesWithInterludes;
}

const TTM_METADATA_NAMESPACE = "http://www.w3.org/ns/ttml#metadata";

function getTtmRole(element: Element) {
  return (
    element.getAttributeNS(TTM_METADATA_NAMESPACE, "role") ??
    element.getAttribute("ttm:role")
  );
}

function parseWordSpans(spans: Element[]): LyricWord[] {
  return spans.flatMap((span, wordPosition) => {
    const wordStartTimeMs = parseTtmlTime(span.getAttribute("begin"));
    const wordEndTimeMs = parseTtmlTime(span.getAttribute("end"));
    const trailingText =
      span.nextSibling?.nodeType === Node.TEXT_NODE
        ? span.nextSibling.textContent?.match(/^\s+/)?.[0] || ""
        : "";
    const text = `${span.textContent || ""}${trailingText}`;
    if (
      wordStartTimeMs === undefined ||
      wordEndTimeMs === undefined ||
      wordEndTimeMs <= wordStartTimeMs ||
      !text
    ) {
      return [];
    }

    return {
      position: wordPosition,
      startTimeMs: wordStartTimeMs,
      endTimeMs: wordEndTimeMs,
      text,
    };
  });
}

function removeBackgroundVocalDelimiters(words: LyricWord[]): LyricWord[] {
  if (!words.length) return words;

  const normalizedWords = words.map((word) => ({ ...word }));
  const firstWord = normalizedWords[0];
  const lastWord = normalizedWords.at(-1);

  firstWord.text = firstWord.text.replace(/^(\s*)\(/, "$1");
  if (lastWord) {
    lastWord.text = lastWord.text.replace(/\)(\s*)$/, "$1");
  }

  return normalizedWords;
}

/**
 * Some TTML files provide timing only on the paragraph (`<p>`) rather than on
 * each word span. Keep that text separate from x-bg content so it can still
 * use the time-synced display as a line-synced lyric.
 */
function getLineSyncedText(paragraph: Element) {
  return Array.from(paragraph.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const element = node as Element;
      return getTtmRole(element) === "x-bg" ? "" : element.textContent || "";
    })
    .join("")
    .trim();
}

function parseTtml(ttml: string): LyricLine[] {
  const document = new DOMParser().parseFromString(ttml, "application/xml");
  if (document.querySelector("parsererror")) return [];

  const lines = Array.from(document.getElementsByTagName("p")).flatMap(
    (paragraph, position) => {
      const startTimeMs = parseTtmlTime(paragraph.getAttribute("begin"));
      const paragraphEndTimeMs = parseTtmlTime(paragraph.getAttribute("end"));
      const agentId =
        paragraph.getAttributeNS(TTM_METADATA_NAMESPACE, "agent") ??
        paragraph.getAttribute("ttm:agent") ??
        undefined;
      const childSpans = Array.from(paragraph.children).filter(
        (element) => element.localName === "span",
      );
      const words = parseWordSpans(
        childSpans.filter((span) => getTtmRole(span) !== "x-bg"),
      );
      const backgroundWords = removeBackgroundVocalDelimiters(
        childSpans
          .filter((span) => getTtmRole(span) === "x-bg")
          .flatMap((backgroundSpan) =>
            parseWordSpans(
              Array.from(backgroundSpan.children).filter(
                (element) => element.localName === "span",
              ),
            ),
          ),
      );
      const endTimeMs = Math.max(
        paragraphEndTimeMs ?? 0,
        ...backgroundWords.map((word) => word.endTimeMs),
      );
      // Word timing wins when available. Otherwise retain the paragraph's
      // begin/end timing and render it as one active line.
      const text = words.length
        ? words.map((word) => word.text).join("")
        : getLineSyncedText(paragraph);
      if (startTimeMs === undefined || endTimeMs <= startTimeMs || !text) {
        return [];
      }

      return {
        position,
        startTimeMs,
        endTimeMs,
        text,
        agentId,
        kind: "LYRIC" as const,
        words: words.length ? words : undefined,
        backgroundWords: backgroundWords.length ? backgroundWords : undefined,
      };
    },
  );

  const hasSecondaryVocalist = lines.some((line) => line.agentId === "v2");
  if (!hasSecondaryVocalist) return addInferredInterludes(lines);

  return addInferredInterludes(
    lines.map(({ agentId, ...line }) => ({
      ...line,
      vocalistType: agentId === "v2" ? "SECONDARY" : "PRIMARY",
    })),
  );
}

export function getSongLyrics(songId: string) {
  return getCachedQuery(
    `song-lyrics:${songId}`,
    async (signal) => {
      const response = await http.get<AppleStyleLyricsResponse>(
        `/songs/${encodeURIComponent(songId)}/lyrics`,
        { signal },
      );
      const ttml = response.data.data?.[0]?.attributes?.ttmlLocalizations;
      if (!ttml) return [];
      return parseTtml(ttml);
    },
    LYRICS_CACHE_TTL_MS,
  );
}
