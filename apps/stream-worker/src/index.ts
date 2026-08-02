interface Env {
  MUSIC_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
}

const EDGE_TTL = 86400;
const BLOCK_SIZE = 256 * 1024;
const MAX_BLOCKS_PER_REQUEST = 6;
const CACHE_READ_TIMEOUT_MS = 150;

const CACHE_HEADERS: Record<string, string> = {
  "Content-Type": "audio/mp4",
  "Accept-Ranges": "bytes",
  "Cache-Control": `public, s-maxage=${EDGE_TTL}, max-age=${EDGE_TTL}, stale-while-revalidate=${EDGE_TTL}, immutable`,
};

type ByteRange = {
  start: number;
  end: number;
};

type StreamBlock = {
  data: ArrayBuffer;
  etag: string;
  totalSize: number;
  cacheHit: boolean;
  r2DurationMs: number;
};

function resolveWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function parseClosedRange(range: string): ByteRange | null {
  const match = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end < start
  ) {
    return null;
  }

  return { start, end };
}

function blockCacheKey(cacheUrl: string, blockIndex: number): Request {
  const keyUrl = new URL(cacheUrl);
  keyUrl.searchParams.set("__stream_block", String(blockIndex));
  return new Request(keyUrl.toString());
}

async function readStreamBlock(
  env: Env,
  ctx: ExecutionContext,
  cache: Cache,
  cacheUrl: string,
  objectKey: string,
  blockIndex: number,
): Promise<StreamBlock | null> {
  const cacheKey = blockCacheKey(cacheUrl, blockIndex);
  const cached = await resolveWithin(
    cache.match(cacheKey),
    CACHE_READ_TIMEOUT_MS,
  );
  if (cached) {
    const totalSize = Number(cached.headers.get("X-Stream-Object-Size"));
    const data = await resolveWithin(
      cached.arrayBuffer(),
      CACHE_READ_TIMEOUT_MS,
    );
    if (data && Number.isSafeInteger(totalSize) && totalSize >= 0) {
      return {
        data,
        etag: cached.headers.get("ETag") || "",
        totalSize,
        cacheHit: true,
        r2DurationMs: 0,
      };
    }
  }

  const blockStart = blockIndex * BLOCK_SIZE;
  const r2StartedAt = performance.now();
  const object = await env.MUSIC_BUCKET.get(objectKey, {
    range: { offset: blockStart, length: BLOCK_SIZE },
  });
  const r2DurationMs = performance.now() - r2StartedAt;
  if (!object || blockStart >= object.size) return null;

  const data = await object.arrayBuffer();
  const headers = {
    ...CACHE_HEADERS,
    "Content-Length": String(data.byteLength),
    ETag: object.etag,
    "X-Stream-Object-Size": String(object.size),
  };
  ctx.waitUntil(
    cache
      .put(cacheKey, new Response(data.slice(0), { headers }))
      .catch(() => undefined),
  );

  return {
    data,
    etag: object.etag,
    totalSize: object.size,
    cacheHit: false,
    r2DurationMs,
  };
}

function createRangeBody(
  blocks: StreamBlock[],
  firstBlockIndex: number,
  range: ByteRange,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < blocks.length; index += 1) {
        const blockStart = (firstBlockIndex + index) * BLOCK_SIZE;
        const start = Math.max(range.start, blockStart) - blockStart;
        const end =
          Math.min(range.end, blockStart + blocks[index].data.byteLength - 1) -
          blockStart;
        if (end < start) continue;

        controller.enqueue(
          new Uint8Array(blocks[index].data, start, end - start + 1),
        );
      }
      controller.close();
    },
  });
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
    const origin = request.headers.get("Origin") ?? "";
    const isAllowedOrigin = env.ALLOWED_ORIGINS.split(",")
      .map((d) => d.trim())
      .includes(origin);
    const cors: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-None-Match",
      "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges, ETag, Server-Timing, X-Stream-Cache",
      Vary: "Origin",
    };

    if (isAllowedOrigin) {
      cors["Access-Control-Allow-Origin"] = origin;
      cors["Timing-Allow-Origin"] = origin;
    }

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

    const requestedRange = parseClosedRange(rangeHeader);
    if (requestedRange) {
      const firstBlockIndex = Math.floor(requestedRange.start / BLOCK_SIZE);
      const requestedLastBlockIndex = Math.floor(
        requestedRange.end / BLOCK_SIZE,
      );
      const requestedBlockCount = requestedLastBlockIndex - firstBlockIndex + 1;

      if (requestedBlockCount <= MAX_BLOCKS_PER_REQUEST) {
        const firstBlock = await readStreamBlock(
          env,
          ctx,
          cache,
          cacheUrl,
          objectKey,
          firstBlockIndex,
        );

        if (!firstBlock) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: { ...cors, "Content-Range": "bytes */*" },
          });
        }

        if (requestedRange.start >= firstBlock.totalSize) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: {
              ...cors,
              "Content-Range": `bytes */${firstBlock.totalSize}`,
            },
          });
        }

        const range = {
          start: requestedRange.start,
          end: Math.min(requestedRange.end, firstBlock.totalSize - 1),
        };
        const lastBlockIndex = Math.floor(range.end / BLOCK_SIZE);
        const blockCount = lastBlockIndex - firstBlockIndex + 1;
        const remainingBlocks = await Promise.all(
          Array.from({ length: blockCount - 1 }, (_, index) =>
            readStreamBlock(
              env,
              ctx,
              cache,
              cacheUrl,
              objectKey,
              firstBlockIndex + index + 1,
            ),
          ),
        );
        const blocks = [firstBlock, ...remainingBlocks];

        if (blocks.every((block): block is StreamBlock => block !== null)) {
          const cacheStatus = blocks.every((block) => block.cacheHit)
            ? "HIT"
            : "MISS";
          const r2DurationMs = Math.max(
            ...blocks.map((block) => block.r2DurationMs),
          );
          const etag = firstBlock.etag;

          if (ifNoneMatch && etag && ifNoneMatch === etag) {
            return new Response(null, {
              status: 304,
              headers: {
                ...cors,
                ETag: etag,
                "Cache-Control": CACHE_HEADERS["Cache-Control"],
                "Server-Timing": serverTiming(
                  startedAt,
                  cacheStatus,
                  r2DurationMs,
                ),
                "X-Stream-Cache": cacheStatus,
              },
            });
          }

          const body = createRangeBody(blocks, firstBlockIndex, range);
          return new Response(body, {
            status: 206,
            headers: {
              ...cors,
              ...CACHE_HEADERS,
              "Content-Length": String(range.end - range.start + 1),
              "Content-Range": `bytes ${range.start}-${range.end}/${firstBlock.totalSize}`,
              ETag: etag,
              "Server-Timing": serverTiming(
                startedAt,
                cacheStatus,
                r2DurationMs,
              ),
              "X-Stream-Cache": cacheStatus,
            },
          });
        }
      }
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
        "Server-Timing": serverTiming(startedAt, "BYPASS", r2DurationMs),
        "X-Stream-Cache": "BYPASS",
      },
    });

    return response;
  },
};
