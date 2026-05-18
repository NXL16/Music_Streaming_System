"use client";

import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

const STREAM_URL_TTL_MS = 5 * 60 * 1000;
const STREAM_META_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const META_RETRY_DELAYS_MS = [150, 350];

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const streamUrlCache = new Map<string, CacheEntry<string>>();
const streamUrlInFlight = new Map<string, Promise<string>>();
const streamDataCache = new Map<string, CacheEntry<StreamDataResponse>>();
const streamDataInFlight = new Map<string, Promise<StreamDataResponse>>();

function enforceCacheLimit<T>(
  cacheMap: Map<string, CacheEntry<T>>,
  maxEntries: number,
): void {
  const now = Date.now();

  for (const [key, entry] of cacheMap.entries()) {
    if (entry.expiresAt <= now) {
      cacheMap.delete(key);
    }
  }

  if (cacheMap.size >= maxEntries) {
    const firstKey = cacheMap.keys().next().value;
    if (firstKey !== undefined) {
      cacheMap.delete(firstKey);
    }
  }
}

api.interceptors.request.use((config) => {
  if (typeof window === "undefined") {
    return config;
  }

  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export type StreamUrlResponse = {
  url: string;
};

export type StreamByteRange = {
  start: number;
  end: number;
};

export type StreamSegment = {
  startByte: number;
  size: number;
  duration: number;
  startTimeSec: number;
};

export type StreamDataResponse = {
  songId: string;
  duration: number;
  seektableVersion: number;
  timescale: number;
  offset: number;
  initRange: StreamByteRange;
  segments: StreamSegment[];
  waveform: number[];
  encryptionStartOffset: number;
};

export type RequestUploadPayload = {
  title: string;
  artist?: string;
  album?: string;
  isPublic?: boolean;
  checksum: string;
  size: number;
};

export type RequestUploadResponse = {
  songId: string;
  instant: boolean;
  uploadUrl: string;
};

export type FinalizeUploadPayload = {
  songId?: string;
  checksum?: string;
};

export type FinalizeUploadResponse = {
  status: string;
};

function isValidStreamDataCache(value: StreamDataResponse): boolean {
  if (!value || !Array.isArray(value.segments) || value.segments.length === 0) {
    return false;
  }
  return value.segments.every(
    (seg) =>
      Number.isFinite(seg.startByte) &&
      Number.isFinite(seg.size) &&
      seg.size > 0 &&
      Number.isFinite(seg.duration) &&
      seg.duration > 0 &&
      Number.isFinite(seg.startTimeSec),
  );
}

type RawSegment = Record<string, unknown>;

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSegments(
  rawSegments: RawSegment[],
  baseOffset: number,
  timescale: number,
): StreamSegment[] {
  const safeTimescale = Math.max(1, timescale);
  const normalized: StreamSegment[] = [];

  let runningByte = Math.max(0, baseOffset);
  let runningTimestampTs = 0;

  for (const seg of rawSegments) {
    const size = toFiniteNumber(seg.size) ?? 0;
    const duration = toFiniteNumber(seg.duration) ?? 0;

    if (size <= 0 || duration <= 0) {
      continue;
    }

    const startByte = toFiniteNumber(seg.startByte) ?? runningByte;
    runningByte = startByte + size;

    const startTimeSec =
      toFiniteNumber(seg.startTimeSec) ?? runningTimestampTs / safeTimescale;
    runningTimestampTs += duration;

    normalized.push({
      startByte,
      size,
      duration,
      startTimeSec,
    });
  }

  return normalized;
}

export async function getStreamUrl(songId: string): Promise<string> {
  const now = Date.now();
  const cached = streamUrlCache.get(songId);
  if (cached && cached.expiresAt > now) return cached.value;

  const pending = streamUrlInFlight.get(songId);
  if (pending) return pending;

  const request = api
    .get<StreamUrlResponse>(`/stream/${songId}`)
    .then((res) => {
      const url = res.data?.url;
      if (!url) throw new Error("Invalid stream URL response");

      enforceCacheLimit(streamUrlCache, MAX_CACHE_ENTRIES);
      streamUrlCache.set(songId, {
        value: url,
        expiresAt: Date.now() + STREAM_URL_TTL_MS,
      });

      return url;
    })
    .finally(() => {
      streamUrlInFlight.delete(songId);
    });

  streamUrlInFlight.set(songId, request);
  return request;
}

export async function getStreamData(
  songId: string,
): Promise<StreamDataResponse> {
  const now = Date.now();
  const cached = streamDataCache.get(songId);
  if (cached && cached.expiresAt > now && isValidStreamDataCache(cached.value)) {
    return cached.value;
  }
  if (cached) {
    streamDataCache.delete(songId);
  }

  const pending = streamDataInFlight.get(songId);
  if (pending) return pending;

  const fetchMetadata = async (): Promise<Record<string, unknown>> => {
    let lastErr: unknown;
    for (let i = 0; i <= META_RETRY_DELAYS_MS.length; i += 1) {
      try {
        const res = await api.get<Record<string, unknown>>(`/metadata/${songId}`);
        return res.data || {};
      } catch (err) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const shouldRetry = status === 503 || status === 502 || status === 504;
        if (!shouldRetry || i === META_RETRY_DELAYS_MS.length) break;
        await new Promise((resolve) => setTimeout(resolve, META_RETRY_DELAYS_MS[i]));
      }
    }
    throw lastErr;
  };

  const request = fetchMetadata()
    .then((raw) => {
      const timescale = Number(raw.timescale ?? 44100);
      const rawSegments = (raw.segments as RawSegment[] | undefined) ?? [];
      const offset = Number(raw.offset ?? 0);

      const segments = normalizeSegments(
        rawSegments,
        Number.isFinite(offset) ? offset : 0,
        Number.isFinite(timescale) ? timescale : 44100,
      );

      const initRangeRaw = (raw.initRange ?? {}) as Record<string, unknown>;
      const initStart = Number(initRangeRaw.start ?? 0);
      const initEnd = Number(
        initRangeRaw.end ?? Math.max(0, Number(raw.encryptionStartOffset ?? 0) - 1),
      );

      const parsed: StreamDataResponse = {
        songId: String(raw.songId ?? songId),
        duration: Number(raw.duration ?? 0),
        seektableVersion: Number(raw.seektableVersion ?? 2),
        timescale: Number.isFinite(timescale) ? timescale : 44100,
        offset: Number.isFinite(offset) ? offset : 0,
        initRange: {
          start: Number.isFinite(initStart) ? Math.max(0, initStart) : 0,
          end: Number.isFinite(initEnd) ? Math.max(0, initEnd) : 0,
        },
        segments,
        waveform: Array.isArray(raw.waveform)
          ? (raw.waveform as unknown[])
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v))
          : [],
        encryptionStartOffset: Number(raw.encryptionStartOffset ?? 0),
      };

      enforceCacheLimit(streamDataCache, MAX_CACHE_ENTRIES);
      streamDataCache.set(songId, {
        value: parsed,
        expiresAt: Date.now() + STREAM_META_TTL_MS,
      });

      return parsed;
    })
    .catch((err) => {
      const stale = streamDataCache.get(songId);
      if (stale && isValidStreamDataCache(stale.value)) {
        return stale.value;
      }
      throw err;
    });

  streamDataInFlight.set(songId, request);
  return request.finally(() => {
    streamDataInFlight.delete(songId);
  });
}

export async function requestSongUpload(
  payload: RequestUploadPayload,
): Promise<RequestUploadResponse> {
  const res = await api.post<RequestUploadResponse>(
    "/songs/request-upload",
    payload,
  );
  return res.data;
}

export async function finalizeSongUpload(
  payload: FinalizeUploadPayload,
): Promise<FinalizeUploadResponse> {
  const res = await api.post<FinalizeUploadResponse>(
    "/songs/finalize-upload",
    payload,
  );
  return res.data;
}

export default api;
