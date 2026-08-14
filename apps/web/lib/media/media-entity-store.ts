import type { MediaCardProps } from "./media-card.types";
import { developmentCacheDisabled } from "@/lib/config/development-cache";

export type MediaEntitySource =
  | "catalog"
  | "library"
  | "recommendation"
  | "player"
  | "local";

type MediaEntityData = Pick<
  MediaCardProps,
  | "title"
  | "subtitle"
  | "description"
  | "contentRating"
  | "artists"
  | "typeTag"
  | "artwork"
>;

type MediaEntity = {
  data: MediaEntityData;
  expiresAt: number;
};

const ENTITY_TTL_MS = 10 * 60 * 1000;
const MAX_ENTITIES = 400;
const entities = new Map<string, MediaEntity>();
const listeners = new Map<string, Set<() => void>>();

function entityKey(
  card: Pick<
    MediaCardProps,
    "resourceType" | "resourceId" | "isUserPlaylist" | "playlistKind"
  >,
) {
  const isUserScoped =
    card.isUserPlaylist ||
    card.playlistKind === "favorite" ||
    card.playlistKind === "user";
  return `${isUserScoped ? "user-library" : "catalog"}:${card.resourceType}:${card.resourceId}`;
}

function pickEntityData(card: MediaCardProps): MediaEntityData {
  return {
    title: card.title,
    subtitle: card.subtitle,
    description: card.description,
    contentRating: card.contentRating,
    artists: card.artists,
    typeTag: card.typeTag,
    artwork: card.artwork,
  };
}

function mergeDefined<T extends object>(base: T, update: T): T {
  return Object.fromEntries(
    Object.entries({ ...base, ...update }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as T;
}

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function trimEntities() {
  const now = Date.now();
  for (const [key, entity] of entities) {
    if (entity.expiresAt <= now) entities.delete(key);
  }
  while (entities.size > MAX_ENTITIES) {
    const oldestKey = entities.keys().next().value;
    if (!oldestKey) break;
    entities.delete(oldestKey);
  }
}

/**
 * Stores scoped resource metadata. A user-library playlist never shares a
 * cache entry with a catalog playlist of the same id. The latest successful
 * API/event boundary replaces only defined metadata; render payloads remain
 * authoritative (see MediaCardRenderer).
 */
export function hydrateMediaEntity(
  card: MediaCardProps,
  _source: MediaEntitySource,
) {
  void _source;
  if (developmentCacheDisabled) return;
  const key = entityKey(card);
  const existing = entities.get(key);
  const incoming = pickEntityData(card);
  const data = mergeDefined(
    existing?.data ?? ({} as MediaEntityData),
    incoming,
  );

  entities.delete(key);
  entities.set(key, {
    data,
    expiresAt: Date.now() + ENTITY_TTL_MS,
  });
  trimEntities();
  notify(key);
}

export function getMediaEntity(
  card: MediaCardProps,
): MediaEntityData | undefined {
  if (developmentCacheDisabled) return undefined;
  const key = entityKey(card);
  const entity = entities.get(key);
  if (!entity || entity.expiresAt <= Date.now()) return undefined;
  return entity.data;
}

export function subscribeMediaEntity(
  card: MediaCardProps,
  listener: () => void,
) {
  const key = entityKey(card);
  const subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(key, subscribers);

  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

export function invalidateMediaEntity(
  resourceType: string,
  resourceId: string,
  scope: "catalog" | "user-library" = "catalog",
) {
  const key = `${scope}:${resourceType}:${resourceId}`;
  if (entities.delete(key)) notify(key);
}

export function invalidateAllMediaEntities() {
  const keys = [...entities.keys()];
  entities.clear();
  keys.forEach(notify);
}
