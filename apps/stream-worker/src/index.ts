interface Env {
  AUDIO_ORIGIN_URL: string;
  ALLOWED_ORIGINS: string;
  VIDEO_CDN_SIGNING_SECRET: string;
}

const EDGE_TTL_SECONDS = 31_536_000;
const EDGE_CACHE_CONTROL = `public, s-maxage=${EDGE_TTL_SECONDS}, max-age=${EDGE_TTL_SECONDS}, immutable`;
const VIDEO_SESSION_TTL_SECONDS = 2 * 60 * 60;
// A playlist and the AES key describe the active session, so neither belongs
// in the browser cache. Segments are immutable and use opaque signed URLs;
// retaining them for the signed-session lifetime makes back-seeks reuse the
// local HTTP cache instead of issuing another CDN request.
const VIDEO_PLAYLIST_CACHE_CONTROL = "private, no-store";
const VIDEO_SEGMENT_CACHE_CONTROL = `private, max-age=${VIDEO_SESSION_TTL_SECONDS}, immutable`;
const ORIGIN_HEADERS = [
  "Range",
  "If-None-Match",
  "If-Modified-Since",
  "If-Range",
];
const SONG_ID_PATTERN =
  /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(instrumental|vocal))?\/?$/i;
const VIDEO_PATH_PATTERN =
  /^\/video\/processed\/(?<assetId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/video\/(?<generation>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?<file>default\.m3u8|[0-9a-f]{24}\.m3u8|[A-Za-z0-9_-]{24}_[0-9]{13,20}\.ts)$/i;
// API signs a two-hour session. Permit a small clock-skew window so an edge
// clock a few seconds behind cannot reject a freshly issued URL.
const VIDEO_SESSION_MAX_SECONDS = VIDEO_SESSION_TTL_SECONDS + 60;
let videoSigningKey: Promise<CryptoKey> | undefined;

type VideoRequest = {
  assetId: string;
  generation: string;
  objectKey: string;
  isPlaylist: boolean;
};

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

function videoRequest(pathname: string): VideoRequest | null {
  const match = VIDEO_PATH_PATTERN.exec(pathname);
  if (!match?.groups) return null;
  const { assetId, generation, file } = match.groups;
  return {
    assetId,
    generation,
    objectKey: `processed/${assetId}/video/${generation}/${file}`,
    isPlaylist: file.endsWith(".m3u8"),
  };
}

function videoSigningCryptoKey(secret: string): Promise<CryptoKey> {
  videoSigningKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return videoSigningKey;
}

function base64Url(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes);
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function equalSignature(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hasValidVideoSignature(
  video: VideoRequest,
  requestUrl: URL,
  env: Env,
): Promise<boolean> {
  const expires = Number(requestUrl.searchParams.get("expires"));
  const signature = requestUrl.searchParams.get("signature");
  const now = Math.floor(Date.now() / 1000);
  if (!signature || !Number.isSafeInteger(expires)) return false;
  if (expires < now || expires > now + VIDEO_SESSION_MAX_SECONDS) return false;

  const payload = `${video.assetId.toLowerCase()}\n${video.generation.toLowerCase()}\n${expires}`;
  const expected = base64Url(
    await crypto.subtle.sign(
      "HMAC",
      await videoSigningCryptoKey(env.VIDEO_CDN_SIGNING_SECRET),
      new TextEncoder().encode(payload),
    ),
  );
  return equalSignature(signature, expected);
}

function originRequest(
  request: Request,
  baseUrl: string,
  key: string,
): Request {
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
  clientCacheControl = EDGE_CACHE_CONTROL,
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
      clientCacheControl,
    );
    headers.set("Accept-Ranges", "bytes");
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function videoResponse(
  request: Request,
  upstream: Response,
  isPlaylist: boolean,
  cors: Record<string, string>,
  startedAt: number,
): Promise<Response> {
  if (!upstream.ok || !isPlaylist) {
    return proxyResponse(
      request,
      upstream,
      cors,
      startedAt,
      VIDEO_SEGMENT_CACHE_CONTROL,
    );
  }

  // Playlist references are relative. URL query parameters do not propagate
  // through a relative URL, so append the same signed session to every media
  // playlist and segment reference while leaving EXT-X-KEY untouched.
  const requestUrl = new URL(request.url);
  const session = requestUrl.search;
  const playlist = await upstream.text();
  const body = playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      return `${trimmed}${session}`;
    })
    .join("\n");
  const headers = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  headers.set("X-Stream-Cache", headers.get("cf-cache-status") ?? "UNKNOWN");
  headers.set(
    "Server-Timing",
    serverTiming(startedAt, headers.get("X-Stream-Cache") ?? "UNKNOWN"),
  );
  headers.set("Content-Type", "application/vnd.apple.mpegurl");
  headers.set(
    "Cache-Control",
    VIDEO_PLAYLIST_CACHE_CONTROL,
  );
  headers.set("Content-Length", String(new TextEncoder().encode(body).length));
  return new Response(request.method === "HEAD" ? null : body, {
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

    const requestUrl = new URL(request.url);
    const video = videoRequest(requestUrl.pathname);
    const key = video?.objectKey ?? objectKey(requestUrl.pathname);
    if (
      !key ||
      (video && !(await hasValidVideoSignature(video, requestUrl, env)))
    ) {
      return new Response("Bad Request", {
        status: video ? 403 : 400,
        headers: { ...cors, "Content-Type": "text/plain" },
      });
    }

    const startedAt = performance.now();
    try {
      const upstream = await fetch(
        originRequest(request, env.AUDIO_ORIGIN_URL, key),
        {
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: {
              "200-299": EDGE_TTL_SECONDS,
              "400-499": 0,
              "500-599": 0,
            },
          },
        },
      );
      return video
        ? await videoResponse(
            request,
            upstream,
            video.isPlaylist,
            cors,
            startedAt,
          )
        : proxyResponse(request, upstream, cors, startedAt);
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
