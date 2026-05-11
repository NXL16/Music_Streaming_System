import { ExecutionContext } from "@cloudflare/workers-types";
import { decryptAesCtrStream, getSongKey } from "./crypto";
import { normalizeRange, CHUNK_SIZE } from "./range";

interface Env {
  R2_PRODUCTION: R2Bucket;
  R2_CDN_URL: string;
  KMS_URL: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405 });

    const rangeHeader = request.headers.get("Range");
    const { start, end, chunkIndex } = normalizeRange(rangeHeader);

    const objectKey = url.pathname.split("/").pop();
    if (!objectKey) return new Response("Invalid ID", { status: 400 });

    const songId = objectKey.replace(/\.[^/.]+$/, "");

    const contentType = objectKey.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";

    // Fetch qua R2 Custom Domain → Cloudflare CDN tự cache tại edge gần user
    const r2Url = `${env.R2_CDN_URL}/processed/${objectKey}`;
    const r2Request = new Request(r2Url, {
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    });

    const keyPromise = getSongKey(env.KMS_URL, songId);

    const response = await fetch(r2Request, {
      cf: {
        cacheEverything: true,
        cacheTtl: 31536000,
        cacheTtlByStatus: {
          "200-206": 31536000,
        },
      },
    });

    if (response.status === 404) {
      keyPromise.catch(() => undefined);
      return new Response("Not Found", { status: 404 });
    }

    if (!response.body) {
      return new Response("Empty response", { status: 502 });
    }

    let songKey: Awaited<typeof keyPromise>;
    try {
      songKey = await keyPromise;
    } catch (error) {
      return new Response("Failed to get key", { status: 502 });
    }

    const decryptedStream = decryptAesCtrStream(
      response.body,
      songKey.cryptoKey,
      songKey.iv,
      start,
    );

    // Prefetch chunk tiếp theo qua CDN
    ctx.waitUntil(prefetchNextChunk(chunkIndex + 1, objectKey, env));

    // Clone response để đọc headers
    const headers = new Headers(response.headers);
    headers.set("Content-Type", contentType);
    const responseLength = response.headers.get("Content-Length");
    const contentLength = responseLength
      ? Number.parseInt(responseLength, 10)
      : end - start + 1;
    const contentEnd = start + contentLength - 1;
    headers.set("Content-Range", `bytes ${start}-${contentEnd}/*`);
    headers.set("Content-Length", contentLength.toString());
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Range");
    headers.set(
      "X-Cache",
      response.headers.get("CF-Cache-Status") || "UNKNOWN",
    );

    return new Response(decryptedStream, {
      status: response.status === 200 ? 206 : response.status,
      headers,
    });
  },
};

async function prefetchNextChunk(
  nextIndex: number,
  objectKey: string,
  env: Env,
) {
  const start = nextIndex * CHUNK_SIZE;
  const end = start + CHUNK_SIZE - 1;

  const r2Url = `${env.R2_CDN_URL}/processed/${objectKey}`;
  await fetch(r2Url, {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 31536000,
      cacheTtlByStatus: {
        "200-206": 31536000,
      },
    },
  });
}
