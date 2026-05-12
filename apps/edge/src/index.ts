import { ExecutionContext } from "@cloudflare/workers-types";
import { decryptAesCtrStream, getSongKey } from "./crypto";
import { normalizeRange, resolveSuffixRange, CHUNK_SIZE } from "./range";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
  R2_PRODUCTION: R2Bucket;
  R2_CDN_URL: string;
  SONG_KEYS: KVNamespace;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CF_CACHE_OPTIONS = {
  cacheEverything: true,
  cacheTtl: 31536000,
  cacheTtlByStatus: { "200-206": 31536000 },
} as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getContentType(objectKey: string): string {
  if (objectKey.endsWith(".m4a")) return "audio/mp4";
  if (objectKey.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function buildR2Url(cdnUrl: string, objectKey: string): string {
  const base = cdnUrl.endsWith("/") ? cdnUrl.slice(0, -1) : cdnUrl;
  return `${base}/processed/${objectKey}`;
}

function extractObjectKey(pathname: string): string | null {
  const key = pathname.split("/").pop();
  return key && key.length > 0 ? key : null;
}

function parseFileSize(r2Response: Response): number | null {
  // Content-Range: bytes 0-131071/1234567
  const contentRange = r2Response.headers.get("Content-Range");
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

// ─── Prefetch ─────────────────────────────────────────────────────────────────

async function prefetchNextChunk(
  nextChunkIndex: number,
  objectKey: string,
  cdnUrl: string,
  fileSize: number | null,
): Promise<void> {
  const start = nextChunkIndex * CHUNK_SIZE;
  if (fileSize !== null && start >= fileSize) return;

  const end = start + CHUNK_SIZE - 1;
  await fetch(buildR2Url(cdnUrl, objectKey), {
    method: "GET",
    headers: { Range: `bytes=${start}-${end}` },
    cf: CF_CACHE_OPTIONS,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const objectKey = extractObjectKey(url.pathname);
    if (!objectKey) return new Response("Invalid path", { status: 400 });

    const songId = objectKey.replace(/\.[^/.]+$/, "");
    const contentType = getContentType(objectKey);
    let range = normalizeRange(request.headers.get("Range"));

    const r2Url = buildR2Url(env.R2_CDN_URL, objectKey);

    // ── Fetch R2 chunk + KV key song song ─────────────────────────────────
    //
    // KV edge latency ~2-5ms, R2 CDN cache hit ~10-30ms
    // → cả hai resolve gần như đồng thời → TTFB gần bằng R2 latency thuần
    //
    const ifNoneMatch = request.headers.get("If-None-Match");

    const [r2Result, keyResult] = await Promise.allSettled([
      fetch(
        new Request(r2Url, {
          headers: {
            Range: `bytes=${range.start}-${range.end}`,
            ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}),
          },
        }),
        { cf: CF_CACHE_OPTIONS },
      ),
      getSongKey(env.SONG_KEYS, songId),
    ]);

    // ── Handle lỗi R2 ────────────────────────────────────────────────────────

    if (r2Result.status === "rejected") {
      return new Response("Upstream fetch failed", { status: 502 });
    }

    const r2Res = r2Result.value;

    if (r2Res.status === 404) {
      return new Response("Not Found", { status: 404 });
    }

    if (r2Res.status === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          ...CORS_HEADERS,
          ETag: r2Res.headers.get("ETag") ?? "",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    if (!r2Res.body) {
      return new Response("Empty upstream response", { status: 502 });
    }

    // ── Handle lỗi KV ────────────────────────────────────────────────────────

    if (keyResult.status === "rejected") {
      await r2Res.body.cancel();
      const msg =
        keyResult.reason instanceof Error
          ? keyResult.reason.message
          : "Key fetch failed";
      // 404 nếu key không tồn tại (bài hát chưa được index), 502 nếu KV lỗi
      const status = msg.includes("not found") ? 404 : 502;
      return new Response(msg, { status });
    }

    const songKey = keyResult.value;
    const fileSize = parseFileSize(r2Res);

    // ── Resolve suffix range nếu cần ─────────────────────────────────────────

    let finalR2Res = r2Res;

    if (range.isSuffix) {
      if (fileSize === null) {
        await r2Res.body.cancel();
        return new Response("Range Not Satisfiable", { status: 416 });
      } else {
        range = resolveSuffixRange(range, fileSize);

        // Re-fetch đúng chunk (chunk 0 vừa fetch bị bỏ, đã có trong CDN cache)
        await r2Res.body.cancel();
        const correctedRes = await fetch(
          new Request(r2Url, {
            headers: { Range: `bytes=${range.start}-${range.end}` },
          }),
          { cf: CF_CACHE_OPTIONS },
        );

        if (!correctedRes.body) {
          return new Response("Empty upstream response", { status: 502 });
        }
        finalR2Res = correctedRes;
      }
    }

    // ── Decrypt stream ────────────────────────────────────────────────────────

    const decryptedStream = decryptAesCtrStream(
      finalR2Res.body!,
      songKey.cryptoKey,
      songKey.iv,
      range.start,
    );

    // ── Prefetch chunk tiếp theo (non-blocking) ───────────────────────────────

    ctx.waitUntil(
      prefetchNextChunk(
        range.chunkIndex + 1,
        objectKey,
        env.R2_CDN_URL,
        fileSize,
      ),
    );

    // ── Build response headers ────────────────────────────────────────────────

    const contentLengthRaw = finalR2Res.headers.get("Content-Length");
    const contentLength = contentLengthRaw
      ? parseInt(contentLengthRaw, 10)
      : range.end - range.start + 1;
    const contentEnd = range.start + contentLength - 1;
    const totalStr = fileSize !== null ? String(fileSize) : "*";

    const headers = new Headers({
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
      "Content-Range": `bytes ${range.start}-${contentEnd}/${totalStr}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Vary": "Range",
      "X-Cache": finalR2Res.headers.get("CF-Cache-Status") ?? "UNKNOWN",
    });

    const etag = finalR2Res.headers.get("ETag");
    if (etag) headers.set("ETag", etag);
    const lastModified = finalR2Res.headers.get("Last-Modified");
    if (lastModified) headers.set("Last-Modified", lastModified);

    return new Response(decryptedStream, {
      status: 206,
      headers,
    });
  },
};
