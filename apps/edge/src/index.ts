import { ExecutionContext } from "@cloudflare/workers-types";
import { decryptAesCtrStream, deriveSongKey } from "./crypto";
import { CHUNK_SIZE, normalizeRange, resolveSuffixRange } from "./range";

interface Env {
  R2_PRODUCTION: R2Bucket;
  MASTER_SECRET_KEY: string;
  MASTER_SIGNING_KEY: string;
  EDGE_CACHE_TTL_SEC?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length",
} as const;

const DEFAULT_EDGE_CACHE_TTL_SEC = 31_536_000;

let cachedSigningSecret = "";
let cachedSigningKeyPromise: Promise<CryptoKey> | null = null;

function buildRangeCacheKey(songId: string, start: number, end: number): string {
  return `https://edge-cache.local/audio/${songId}?start=${start}&end=${end}`;
}
function chunkStartAt(offset: number): number {
  return Math.floor(offset / CHUNK_SIZE) * CHUNK_SIZE;
}

function extractSongId(pathname: string): string | null {
  const match = pathname.match(/^\/audio\/([^/]+)$/);
  return match ? match[1] : null;
}

function toR2ObjectKey(songId: string): string {
  return `processed/${songId}.m4a`;
}

function hexToBytes(input: string): Uint8Array {
  if (!input || input.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(input.length / 2);
  for (let i = 0; i < input.length; i += 2) {
    const value = Number.parseInt(input.slice(i, i + 2), 16);
    if (Number.isNaN(value)) return new Uint8Array();
    out[i / 2] = value;
  }
  return out;
}

function buildClientCacheControl(ttl: number): string {
  return `public, max-age=${ttl}, s-maxage=${ttl}, immutable, no-transform`;
}

function buildEdgeCacheControl(ttl: number): string {
  return `public, max-age=${ttl}`;
}

function sliceStream(
  stream: ReadableStream<Uint8Array>,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  let offset = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (offset > end) return;

        const chunkStart = offset;
        const chunkEnd = offset + chunk.length - 1;

        if (chunkEnd < start) {
          offset += chunk.length;
          return;
        }

        const from = Math.max(0, start - chunkStart);
        const to = Math.min(chunk.length, end - chunkStart + 1);

        if (to > from) {
          controller.enqueue(chunk.subarray(from, to));
        }

        offset += chunk.length;
        if (offset > end) {
          controller.terminate();
        }
      },
    }),
  );
}

async function getSigningKey(signingKey: string): Promise<CryptoKey> {
  if (signingKey !== cachedSigningSecret) {
    cachedSigningSecret = signingKey;
    cachedSigningKeyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  if (!cachedSigningKeyPromise) {
    throw new Error("Failed to initialize signing key");
  }
  return cachedSigningKeyPromise;
}

async function verifySignedUrl(
  rawUrl: string,
  songId: string,
  signingKey: string,
): Promise<Response | null> {
  const url = new URL(rawUrl);
  const token = url.searchParams.get("__token__");
  if (!token) return new Response("Missing token", { status: 401 });

  const expMatch = token.match(/exp=(\d+)/);
  const hmacMatch = token.match(/hmac=([a-f0-9]+)/);
  if (!expMatch || !hmacMatch) {
    return new Response("Invalid token format", { status: 401 });
  }

  const exp = expMatch[1];
  const hmacHex = hmacMatch[1];
  if (Number.parseInt(exp, 10) < Math.floor(Date.now() / 1000)) {
    return new Response("Token expired", { status: 401 });
  }

  const key = await getSigningKey(signingKey);
  const payload = new TextEncoder().encode(`${songId}~exp=${exp}`);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(hmacHex),
    payload,
  );
  if (!isValid) return new Response("Invalid token", { status: 403 });
  return null;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      const songId = extractSongId(new URL(request.url).pathname);
      if (!songId) return new Response("Invalid path", { status: 400 });
      const r2ObjectKey = toR2ObjectKey(songId);

      const verifyError = await verifySignedUrl(
        request.url,
        songId,
        env.MASTER_SIGNING_KEY,
      );
      if (verifyError) return verifyError;

      const hasRangeHeader = !!request.headers.get("Range");
      let range = normalizeRange(request.headers.get("Range"));
      if (!hasRangeHeader) {
        return new Response("Range header required", { status: 416 });
      }
      if (hasRangeHeader && !range.isValid) {
        return new Response("Range Not Satisfiable", { status: 416 });
      }

      const edgeCacheTtl =
        Number.parseInt(env.EDGE_CACHE_TTL_SEC ?? "", 10) ||
        DEFAULT_EDGE_CACHE_TTL_SEC;
      const clientCacheControl = buildClientCacheControl(edgeCacheTtl);
      const cdnCacheControl = `public, s-maxage=${edgeCacheTtl}`;
      const edgeCacheControl = buildEdgeCacheControl(edgeCacheTtl);

      let totalSize: number | null = null;
      if (hasRangeHeader && range.isSuffix) {
        const headObj = await env.R2_PRODUCTION.head(r2ObjectKey);
        if (!headObj) return new Response("Not Found", { status: 404 });
        totalSize = headObj.size;
        range = resolveSuffixRange(range, totalSize);
      }

      let cacheReq: Request | null = null;
      let requestStart = range.start;
      let requestEnd = range.end;
      let fetchStart = range.start;
      let fetchEnd = range.end;
      let canUseChunkCache = false;

      if (hasRangeHeader) {
        const chunkStart = chunkStartAt(range.start);
        const chunkEnd = chunkStart + CHUNK_SIZE - 1;
        canUseChunkCache = range.end <= chunkEnd;
        if (canUseChunkCache) {
          fetchStart = chunkStart;
          fetchEnd = chunkEnd;
        }
      }

      if (hasRangeHeader) {
        cacheReq = new Request(buildRangeCacheKey(songId, fetchStart, fetchEnd), {
          method: "GET",
        });
        const cacheHit = await caches.default.match(cacheReq);
        if (cacheHit) {
          let cachedBody = await cacheHit.arrayBuffer();
          if (canUseChunkCache) {
            const from = Math.max(0, requestStart - fetchStart);
            const to = Math.min(cachedBody.byteLength, requestEnd - fetchStart + 1);
            cachedBody = cachedBody.slice(from, to);
          }
          const total = cacheHit.headers.get("X-Total-Size") ?? "*";
          const headers = new Headers({
            ...CORS_HEADERS,
            "Content-Type": "audio/mp4",
            "Content-Length": String(cachedBody.byteLength),
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${requestStart}-${requestStart + cachedBody.byteLength - 1}/${total}`,
            "Cache-Control": clientCacheControl,
            "CDN-Cache-Control": cdnCacheControl,
            "Surrogate-Control": `max-age=${edgeCacheTtl}`,
          });
          return new Response(cachedBody, { status: 206, headers });
        }
      }

      const r2Obj = hasRangeHeader
        ? await env.R2_PRODUCTION.get(r2ObjectKey, {
            range: { offset: fetchStart, length: fetchEnd - fetchStart + 1 },
          })
        : await env.R2_PRODUCTION.get(r2ObjectKey);

      if (!r2Obj || !r2Obj.body) {
        if (hasRangeHeader) {
          return new Response("Range Not Satisfiable", { status: 416 });
        }
        return new Response("Not Found", { status: 404 });
      }

      if (totalSize === null && typeof r2Obj.size === "number" && r2Obj.size > 0) {
        totalSize = r2Obj.size;
      }

      const songKey = await deriveSongKey(env.MASTER_SECRET_KEY, songId);
      const decryptedStream = decryptAesCtrStream(
        r2Obj.body,
        songKey.cryptoKey,
        songKey.iv,
        hasRangeHeader ? fetchStart : 0,
      );

      const contentLength =
        hasRangeHeader && r2Obj.range && "length" in r2Obj.range
          ? r2Obj.range.length
          : typeof r2Obj.size === "number" && r2Obj.size > 0
            ? r2Obj.size
            : null;

      const headers = new Headers({
        ...CORS_HEADERS,
        "Content-Type": "audio/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": clientCacheControl,
        "CDN-Cache-Control": cdnCacheControl,
        "Surrogate-Control": `max-age=${edgeCacheTtl}`,
      });
      if (contentLength !== null) {
        headers.set("Content-Length", String(contentLength));
      }
      if (r2Obj.httpEtag) headers.set("ETag", r2Obj.httpEtag);
      if (r2Obj.uploaded) headers.set("Last-Modified", r2Obj.uploaded.toUTCString());

      if (hasRangeHeader) {
        if (canUseChunkCache) {
          const relativeStart = Math.max(0, requestStart - fetchStart);
          const relativeEnd = Math.max(relativeStart, requestEnd - fetchStart);
          const contentEnd = requestStart + (relativeEnd - relativeStart);
          headers.set(
            "Content-Range",
            `bytes ${requestStart}-${contentEnd}/${totalSize !== null ? String(totalSize) : "*"}`,
          );
          headers.set("Content-Length", String(relativeEnd - relativeStart + 1));

          const [clientStream, cacheStream] = decryptedStream.tee();
          const slicedStream = sliceStream(
            clientStream,
            relativeStart,
            relativeEnd,
          );

          if (cacheReq) {
            ctx.waitUntil(
              (async () => {
                const cacheBody = await new Response(cacheStream).arrayBuffer();
                const cacheHeaders = new Headers({
                  "X-Total-Size": totalSize !== null ? String(totalSize) : "*",
                  "Content-Length": String(cacheBody.byteLength),
                  "Cache-Control": edgeCacheControl,
                });
                await caches.default.put(
                  cacheReq,
                  new Response(cacheBody, { status: 200, headers: cacheHeaders }),
                );
              })().catch(() => {}),
            );
          }
          return new Response(slicedStream, { status: 206, headers });
        }

        const contentEnd = requestStart + (requestEnd - requestStart);
        headers.set(
          "Content-Range",
          `bytes ${requestStart}-${contentEnd}/${totalSize !== null ? String(totalSize) : "*"}`,
        );
        const [clientStream, cacheStream] = decryptedStream.tee();
        headers.set("Content-Length", String(requestEnd - requestStart + 1));
        if (cacheReq && fetchStart === requestStart && fetchEnd === requestEnd) {
          ctx.waitUntil(
            (async () => {
              const cacheBody = await new Response(cacheStream).arrayBuffer();
              const cacheHeaders = new Headers({
                "X-Total-Size": totalSize !== null ? String(totalSize) : "*",
                "Content-Length": String(cacheBody.byteLength),
                "Cache-Control": edgeCacheControl,
              });
              await caches.default.put(
                cacheReq,
                new Response(cacheBody, { status: 200, headers: cacheHeaders }),
              );
            })().catch(() => {}),
          );
        }

        return new Response(clientStream, { status: 206, headers });
      }

      return new Response(decryptedStream, { status: 206, headers });
    } catch {
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
