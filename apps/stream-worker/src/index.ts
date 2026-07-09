interface Env {
  MUSIC_BUCKET: R2Bucket;
  ALLOWED_ORIGIN: string;
}

const EDGE_TTL = 86400;

const CACHE_HEADERS: Record<string, string> = {
  "Content-Type": "audio/mp4",
  "Accept-Ranges": "bytes",
  "Cache-Control": `public, s-maxage=${EDGE_TTL}, max-age=${EDGE_TTL}, stale-while-revalidate=${EDGE_TTL}, immutable`,
};

function parseRange(
  header: string,
  totalSize: number,
): { start: number; end: number } | null {
  const standard = header.match(/^bytes=(\d+)-(\d*)$/);
  if (standard) {
    const start = parseInt(standard[1], 10);
    const end = standard[2] ? parseInt(standard[2], 10) : totalSize - 1;
    if (start > end || start >= totalSize) return null;
    return { start, end: Math.min(end, totalSize - 1) };
  }

  const suffix = header.match(/^bytes=-(\d+)$/);
  if (suffix) {
    const len = parseInt(suffix[1], 10);
    if (len === 0) return null;
    return { start: Math.max(0, totalSize - len), end: totalSize - 1 };
  }

  return null;
}

async function warmFullCache(
  cache: Cache,
  cacheUrl: string,
  bucket: R2Bucket,
  objectKey: string,
): Promise<void> {
  const existing = await cache.match(cacheUrl);
  if (existing) return;

  const object = await bucket.get(objectKey);
  if (!object) return;

  await cache.put(
    cacheUrl,
    new Response(object.body, {
      headers: {
        ...CACHE_HEADERS,
        "Content-Length": String(object.size),
        "ETag": object.etag,
      },
    }),
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-None-Match",
      "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges, ETag",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Max-Age": "86400" },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...cors, "Content-Type": "text/plain" },
      });
    }

    const url = new URL(request.url);
    const songId = decodeURIComponent(url.pathname.slice(1));
    if (!songId) {
      return new Response("Bad Request", {
        status: 400,
        headers: { ...cors, "Content-Type": "text/plain" },
      });
    }

    const objectKey = `processed/${songId}.m4a`;
    const cache = caches.default;
    const cacheUrl = `${url.origin}/${songId}`;
    const ifNoneMatch = request.headers.get("If-None-Match");

    // --- HEAD: prefer cache, fallback R2 ---
    if (request.method === "HEAD") {
      const cached = await cache.match(cacheUrl);
      if (cached) {
        const etag = cached.headers.get("ETag") || "";
        if (ifNoneMatch && ifNoneMatch === etag) {
          return new Response(null, {
            status: 304,
            headers: { ...cors, ETag: etag, "Cache-Control": CACHE_HEADERS["Cache-Control"] },
          });
        }
        return new Response(null, {
          status: 200,
          headers: {
            ...cors,
            ...CACHE_HEADERS,
            "Content-Length": cached.headers.get("Content-Length") || "0",
            ETag: etag,
          },
        });
      }

      const head = await env.MUSIC_BUCKET.head(objectKey);
      if (!head) {
        return new Response("Not Found", {
          status: 404,
          headers: { ...cors, "Content-Type": "text/plain" },
        });
      }

      return new Response(null, {
        status: 200,
        headers: {
          ...cors,
          ...CACHE_HEADERS,
          "Content-Length": String(head.size),
          ETag: head.etag,
        },
      });
    }

    // --- GET: single cache lookup for both 304 and body serving ---
    const cached = await cache.match(cacheUrl);
    const rangeHeader = request.headers.get("Range");

    if (ifNoneMatch && cached) {
      const cachedETag = cached.headers.get("ETag");
      if (cachedETag && ifNoneMatch === cachedETag) {
        return new Response(null, {
          status: 304,
          headers: { ...cors, ETag: cachedETag, "Cache-Control": CACHE_HEADERS["Cache-Control"] },
        });
      }
    }

    // Full GET (no Range header)
    if (!rangeHeader) {
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            ...cors,
            ...CACHE_HEADERS,
            "Content-Length": cached.headers.get("Content-Length") || "0",
            ETag: cached.headers.get("ETag") || "",
          },
        });
      }

      const object = await env.MUSIC_BUCKET.get(objectKey);
      if (!object) {
        return new Response("Not Found", {
          status: 404,
          headers: { ...cors, "Content-Type": "text/plain" },
        });
      }

      if (ifNoneMatch && ifNoneMatch === object.etag) {
        await object.body.cancel();
        return new Response(null, {
          status: 304,
          headers: { ...cors, ETag: object.etag, "Cache-Control": CACHE_HEADERS["Cache-Control"] },
        });
      }

      const response = new Response(object.body, {
        status: 200,
        headers: {
          ...cors,
          ...CACHE_HEADERS,
          "Content-Length": String(object.size),
          ETag: object.etag,
        },
      });

      ctx.waitUntil(cache.put(cacheUrl, response.clone()));
      return response;
    }

    // Range GET — slice from cache if warm
    if (cached) {
      const fullSize = parseInt(cached.headers.get("Content-Length") || "0");
      if (fullSize > 0) {
        const parsed = parseRange(rangeHeader, fullSize);
        if (parsed) {
          const { start, end } = parsed;
          const fullBody = await cached.arrayBuffer();

          return new Response(fullBody.slice(start, end + 1), {
            status: 206,
            headers: {
              ...cors,
              ...CACHE_HEADERS,
              "Content-Length": String(end - start + 1),
              "Content-Range": `bytes ${start}-${end}/${fullSize}`,
              ETag: cached.headers.get("ETag") || "",
            },
          });
        }
      }
    }

    // Range cache miss → R2 with native range read
    const object = await env.MUSIC_BUCKET.get(objectKey, {
      range: request.headers,
    });
    if (!object) {
      return new Response("Not Found", {
        status: 404,
        headers: { ...cors, "Content-Type": "text/plain" },
      });
    }

    const body = "body" in object ? object.body : null;
    const totalSize = object.size;
    const r2Range = object.range;

    let start: number;
    let end: number;

    if (r2Range && "offset" in r2Range) {
      start = r2Range.offset ?? 0;
      end = start + (r2Range.length ?? totalSize - start) - 1;
    } else if (r2Range && "suffix" in r2Range) {
      end = totalSize - 1;
      start = totalSize - r2Range.suffix;
    } else {
      start = 0;
      end = totalSize - 1;
    }

    ctx.waitUntil(warmFullCache(cache, cacheUrl, env.MUSIC_BUCKET, objectKey));

    return new Response(body, {
      status: 206,
      headers: {
        ...cors,
        ...CACHE_HEADERS,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        ETag: object.etag,
      },
    });
  },
};
