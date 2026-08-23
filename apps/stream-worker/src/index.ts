interface Env {
  AUDIO_ORIGIN_URL: string;
  ALLOWED_ORIGINS: string;
}

const EDGE_TTL_SECONDS = 31_536_000;
const ORIGIN_HEADERS = [
  "Range",
  "If-None-Match",
  "If-Modified-Since",
  "If-Range",
];
const SONG_ID_PATTERN =
  /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(instrumental|vocal))?\/?$/i;

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, If-None-Match, If-Modified-Since, If-Range",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges, ETag, Server-Timing, X-Stream-Cache",
    Vary: "Origin",
  };

  if (allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Timing-Allow-Origin"] = origin;
  }

  return headers;
}

function objectKey(pathname: string): string | null {
  // Song IDs are UUIDs. Matching the encoded pathname directly means an
  // encoded slash, dot segment, malformed escape, or extra object-key path
  // cannot be decoded into a different R2 origin path.
  const match = SONG_ID_PATTERN.exec(pathname);
  if (!match) return null;

  const [, songId, variant] = match;
  return variant
    ? `processed/${songId}/${variant}.m4a`
    : `processed/${songId}.m4a`;
}

function originRequest(request: Request, baseUrl: string, key: string): Request {
  const headers = new Headers();
  for (const name of ORIGIN_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Request(`${baseUrl.replace(/\/+$/, "")}/${key}`, {
    method: request.method,
    headers,
  });
}

function serverTiming(startedAt: number, cacheStatus: string): string {
  return [
    `stream;dur=${(performance.now() - startedAt).toFixed(1)}`,
    `edge-cache;desc="${cacheStatus}"`,
  ].join(", ");
}

function proxyResponse(
  request: Request,
  upstream: Response,
  cors: Record<string, string>,
  startedAt: number,
): Response {
  const headers = new Headers(upstream.headers);
  const cacheStatus = headers.get("cf-cache-status") ?? "UNKNOWN";

  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  headers.set("X-Stream-Cache", cacheStatus);
  headers.set("Server-Timing", serverTiming(startedAt, cacheStatus));

  if (upstream.ok) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "audio/mp4");
    headers.set(
      "Cache-Control",
      `public, s-maxage=${EDGE_TTL_SECONDS}, max-age=${EDGE_TTL_SECONDS}, immutable`,
    );
    headers.set("Accept-Ranges", "bytes");
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const cors = corsHeaders(request, env);

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

    const key = objectKey(new URL(request.url).pathname);
    if (!key) {
      return new Response("Bad Request", {
        status: 400,
        headers: { ...cors, "Content-Type": "text/plain" },
      });
    }

    const startedAt = performance.now();
    try {
      const upstream = await fetch(originRequest(request, env.AUDIO_ORIGIN_URL, key), {
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: {
            "200-299": EDGE_TTL_SECONDS,
            "400-499": 0,
            "500-599": 0,
          },
        },
      });
      return proxyResponse(request, upstream, cors, startedAt);
    } catch {
      return new Response("Stream temporarily unavailable", {
        status: 503,
        headers: {
          ...cors,
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
          "Retry-After": "0",
          "X-Stream-Cache": "ERROR",
        },
      });
    }
  },
};
