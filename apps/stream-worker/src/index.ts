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

function isCacheableRange(range: string): boolean {
  // MSE makes single byte-range requests. Do not cache multi-ranges, which
  // create high-cardinality cache keys without helping normal playback.
  return range.length <= 128 && /^bytes=(?:\d+-\d*|-\d+)$/.test(range);
}

function rangeCacheKey(cacheUrl: string, range: string): Request {
  const keyUrl = new URL(cacheUrl);
  keyUrl.searchParams.set("__stream_range", range);
  return new Request(keyUrl.toString());
}

function serverTiming(
  startedAt: number,
  cacheStatus: "HIT" | "MISS" | "BYPASS",
  r2DurationMs = 0,
): string {
  const totalDurationMs = performance.now() - startedAt;
  return [
    `stream;dur=${totalDurationMs.toFixed(1)}`,
    `r2;dur=${r2DurationMs.toFixed(1)}`,
    `edge-cache;desc="${cacheStatus}"`,
  ].join(", ");
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
        "Content-Range, Content-Length, Accept-Ranges, ETag, Server-Timing, X-Stream-Cache",
      "Timing-Allow-Origin": env.ALLOWED_ORIGIN,
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
    const startedAt = performance.now();

    // --- HEAD: prefer cache, fallback R2 ---
    if (request.method === "HEAD") {
      const cached = await cache.match(cacheUrl);
      if (cached) {
        const etag = cached.headers.get("ETag") || "";
        if (ifNoneMatch && ifNoneMatch === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ...cors,
              ETag: etag,
              "Cache-Control": CACHE_HEADERS["Cache-Control"],
            },
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

    const rangeHeader = request.headers.get("Range");
    // A full cached object cannot efficiently serve a byte seek: reading it
    // just to discard most bytes hurts latency and Worker memory.
    const cached = rangeHeader ? undefined : await cache.match(cacheUrl);

    if (ifNoneMatch && cached) {
      const cachedETag = cached.headers.get("ETag");
      if (cachedETag && ifNoneMatch === cachedETag) {
        return new Response(null, {
          status: 304,
          headers: {
            ...cors,
            ETag: cachedETag,
            "Cache-Control": CACHE_HEADERS["Cache-Control"],
          },
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
          headers: {
            ...cors,
            ETag: object.etag,
            "Cache-Control": CACHE_HEADERS["Cache-Control"],
          },
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

      ctx.waitUntil(
        cache.put(cacheUrl, response.clone()).catch(() => undefined),
      );
      return response;
    }

    // Range GET — cache encrypted byte ranges independently. A hit avoids the
    // R2 read entirely for repeated seeks and MSE preloads.
    const cacheKey = isCacheableRange(rangeHeader)
      ? rangeCacheKey(cacheUrl, rangeHeader)
      : undefined;
    const cachedRange = cacheKey ? await cache.match(cacheKey) : undefined;

    if (cachedRange) {
      const etag = cachedRange.headers.get("ETag") || "";
      if (ifNoneMatch && etag && ifNoneMatch === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            ...cors,
            ETag: etag,
            "Cache-Control": CACHE_HEADERS["Cache-Control"],
            "Server-Timing": serverTiming(startedAt, "HIT"),
            "X-Stream-Cache": "HIT",
          },
        });
      }

      return new Response(cachedRange.body, {
        status: 206,
        headers: {
          ...cors,
          ...CACHE_HEADERS,
          "Content-Length": cachedRange.headers.get("Content-Length") || "0",
          "Content-Range": cachedRange.headers.get("Content-Range") || "",
          ETag: etag,
          "Server-Timing": serverTiming(startedAt, "HIT"),
          "X-Stream-Cache": "HIT",
        },
      });
    }

    const r2StartedAt = performance.now();
    const object = await env.MUSIC_BUCKET.get(objectKey, {
      range: request.headers,
    });
    const r2DurationMs = performance.now() - r2StartedAt;
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

    const response = new Response(body, {
      status: 206,
      headers: {
        ...cors,
        ...CACHE_HEADERS,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        ETag: object.etag,
        "Server-Timing": serverTiming(
          startedAt,
          cacheKey ? "MISS" : "BYPASS",
          r2DurationMs,
        ),
        "X-Stream-Cache": cacheKey ? "MISS" : "BYPASS",
      },
    });

    if (cacheKey) {
      // Store as 200 internally: Cache API handling for partial (206) responses
      // varies, while the response returned to the media client remains 206.
      const cachedResponse = response.clone();
      ctx.waitUntil(
        cache
          .put(
            cacheKey,
            new Response(cachedResponse.body, {
              headers: cachedResponse.headers,
            }),
          )
          .catch(() => undefined),
      );
    }

    return response;
  },
};
