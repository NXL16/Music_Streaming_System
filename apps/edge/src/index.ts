const BLOCK_SIZE = 256 * 1024;

type R2EventNotification = {
  account: string;
  action: string;
  bucket: string;
  object: {
    key: string;
    size: number;
    eTag: string;
  };
  eventTime: string;
};

type StreamCookiePayload = {
  songId: string;
  objectKey: string;
  exp: number;
};

type R2ObjectLike = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag?: string;
  httpMetadata?: {
    contentType?: string;
  };
};

type R2BucketLike = {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectLike | null>;
};

type Env = {
  R2_PRODUCTION: R2BucketLike;
  STREAM_COOKIE_SECRET: string;
  STREAM_COOKIE_NAME?: string;
  UPLOAD_QUEUE: {send: (body: unknown) => Promise<void>};
  API_BASE_URL: string;
};

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/stream\/([^/]+)$/);
    if (!pathMatch) {
      return new Response('Not Found', { status: 404 });
    }

    const songId = decodeURIComponent(pathMatch[1]);
    const cookieName = env.STREAM_COOKIE_NAME || 'stream_auth';
    const cookieValue = readCookie(request.headers.get('Cookie') || '', cookieName);
    if (!cookieValue) {
      return new Response('Forbidden', { status: 403 });
    }

    const payload = await verifyCookie(cookieValue, env.STREAM_COOKIE_SECRET);
    if (!payload) {
      return new Response('Forbidden', { status: 403 });
    }

    if (payload.songId !== songId) {
      return new Response('Forbidden', { status: 403 });
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return new Response('Forbidden', { status: 403 });
    }

    const normalizedRange = normalizeRange(request.headers.get('Range'));
    const object = await env.R2_PRODUCTION.get(payload.objectKey, {
      range: normalizedRange,
    });

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    headers.set('Content-Type', object.httpMetadata?.contentType || 'audio/mp4');
    headers.set('Content-Length', String(object.size));
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }

    const status = normalizedRange ? 206 : 200;
    if (normalizedRange) {
      const end = normalizedRange.offset + normalizedRange.length - 1;
      headers.set('Content-Range', `bytes ${normalizedRange.offset}-${end}/*`);
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status, headers });
    }

    return new Response(object.body, { status, headers });
  },

  async queue(batch: {messages: Array<{id: string; body: R2EventNotification}>}, env: Env): Promise<void> {
    console.log(`📨 Processing ${batch.messages.length} R2 event(s)...`);

    for (const message of batch.messages) {
      try {
        const event = message.body as R2EventNotification;
        
        // Extract songId from object key: quarantine/{checksum}/{filename}
        // or process based on your naming convention
        const keyParts = event.object.key.split('/');
        if (keyParts.length < 2 || keyParts[0] !== 'quarantine') {
          console.log(`⚠️  Skipping event for key: ${event.object.key} (not in quarantine/)`);
          continue;
        }

        const checksum = keyParts[1];
        console.log(`🎵 R2 event: ${event.action} for checksum=${checksum}, size=${event.object.size}`);

        // Call API to finalize upload (API will look up song by checksum and enqueue job)
        const apiUrl = `${env.API_BASE_URL}/songs/finalize-upload`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checksum: checksum,
            sourceObjectPath: event.object.key,
          }),
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${await response.text()}`);
        }

        console.log(`✅ Finalized upload for checksum=${checksum}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to process R2 event: ${errMsg}`);
        // Optionally retry by calling message.retry()
      }
    }
  },
};

export default handler;

function readCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

async function verifyCookie(
  token: string,
  secret: string,
): Promise<StreamCookiePayload | null> {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expected = await sign(payloadPart, secret);
  if (expected !== signaturePart) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payloadPart)) as StreamCookiePayload;
  } catch {
    return null;
  }
}

async function sign(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(input),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function normalizeRange(headerValue: string | null): { offset: number; length: number } {
  if (!headerValue) {
    return { offset: 0, length: BLOCK_SIZE };
  }

  const match = headerValue.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) {
    return { offset: 0, length: BLOCK_SIZE };
  }

  const requestedStart = Number(match[1]);
  if (!Number.isFinite(requestedStart) || requestedStart < 0) {
    return { offset: 0, length: BLOCK_SIZE };
  }

  const blockStart = Math.floor(requestedStart / BLOCK_SIZE) * BLOCK_SIZE;
  return { offset: blockStart, length: BLOCK_SIZE };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}