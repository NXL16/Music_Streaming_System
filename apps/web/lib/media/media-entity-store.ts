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
  | "slug"
  | "artists"
  | "isUserPlaylist"
  | "playlistKind"
  | "typeTag"
  | "artwork"
>;

type MediaEntity = {
  data: MediaEntityData;
  priority: number;
  expiresAt: number;
};

const ENTITY_TTL_MS = 10 * 60 * 1000;
const MAX_ENTITIES = 400;
const sourcePriority: Record<MediaEntitySource, number> = {
  catalog: 4,
  library: 3,
  recommendation: 2,
  player: 1,
  local: 0,
};
const entities = new Map<string, MediaEntity>();
const listeners = new Map<string, Set<() => void>>();

function entityKey(card: Pick<MediaCardProps, "resourceType" | "resourceId">) {
  return `${card.resourceType}:${card.resourceId}`;
}

function pickEntityData(card: MediaCardProps): MediaEntityData {
  return {
    title: card.title,
    subtitle: card.subtitle,
    description: card.description,
    contentRating: card.contentRating,
    slug: card.slug,
    artists: card.artists,
    isUserPlaylist: card.isUserPlaylist,
    playlistKind: card.playlistKind,
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
 * Stores canonical resource metadata. Renderers project the canonical artwork
 * into cover or hero renditions, so presentation never duplicates resource
 * data or overwrites a different layout's srcSet.
 */
export function hydrateMediaEntity(
  card: MediaCardProps,
  source: MediaEntitySource,
) {
  if (developmentCacheDisabled) return;
  const key = entityKey(card);
  const existing = entities.get(key);
  const incoming = pickEntityData(card);
  const priority = sourcePriority[source];
  const data =
    !existing || priority >= existing.priority
      ? mergeDefined(existing?.data ?? ({} as MediaEntityData), incoming)
      : mergeDefined(incoming, existing.data);

  entities.delete(key);
  entities.set(key, {
    data,
    priority: Math.max(priority, existing?.priority ?? priority),
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
) {
  const key = `${resourceType}:${resourceId}`;
  if (entities.delete(key)) notify(key);
}

export function invalidateAllMediaEntities() {
  const keys = [...entities.keys()];
  entities.clear();
  keys.forEach(notify);
}
