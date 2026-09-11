import { http } from "@/lib/api/http";

const EVENT_NAME = "suggest-less-changed";
const SYNC_CHANNEL = "suggest-less-changes";

type SuggestLessDetail = {
  resourceType: string;
  resourceId: string;
  active: boolean;
};

type HiddenContentResponse = {
  hiddenResources?: Array<{ resourceType: string; resourceId: string }>;
};

const hiddenKeys = new Set<string>();
let hydrated = false;
let hydrationRequest: Promise<void> | null = null;
let revision = 0;
const syncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(SYNC_CHANNEL)
    : null;

function key(resourceType: string, resourceId: string) {
  return `${resourceType}:${resourceId}`;
}

function notify(detail: SuggestLessDetail, broadcast = true) {
  window.dispatchEvent(
    new CustomEvent<SuggestLessDetail>(EVENT_NAME, { detail }),
  );
  if (broadcast) syncChannel?.postMessage(detail);
}

if (syncChannel) {
  syncChannel.onmessage = (event: MessageEvent<SuggestLessDetail>) => {
    const detail = event.data;
    if (!detail?.resourceType || !detail.resourceId) return;
    if (detail.active) hiddenKeys.add(key(detail.resourceType, detail.resourceId));
    else hiddenKeys.delete(key(detail.resourceType, detail.resourceId));
    revision += 1;
    notify(detail, false);
  };
}

export function isSuggestLessActive(resourceType: string, resourceId: string) {
  return hiddenKeys.has(key(resourceType, resourceId));
}

/** Loads the server-owned opt-out state once per authenticated browser session. */
export function hydrateSuggestLess() {
  if (hydrated) return Promise.resolve();
  if (hydrationRequest) return hydrationRequest;

  const requestRevision = revision;
  hydrationRequest = http
    .get<HiddenContentResponse>("/me/recommendations/suggest-less")
    .then(({ data }) => {
      if (requestRevision !== revision) return;
      hiddenKeys.clear();
      for (const resource of data.hiddenResources ?? []) {
        if (resource.resourceType && resource.resourceId) {
          hiddenKeys.add(key(resource.resourceType, resource.resourceId));
        }
      }
      hydrated = true;
    })
    .finally(() => {
      hydrationRequest = null;
    });
  return hydrationRequest;
}

export async function setSuggestLess(
  resourceType: string,
  resourceId: string,
  active: boolean,
) {
  const resourceKey = key(resourceType, resourceId);
  const previous = hiddenKeys.has(resourceKey);
  if (active) hiddenKeys.add(resourceKey);
  else hiddenKeys.delete(resourceKey);
  revision += 1;
  notify({ resourceType, resourceId, active });

  try {
    const { data } = await http.post<{ success: boolean }>(
      "/me/recommendations/suggest-less",
      {
      resourceType,
      resourceId,
      active,
      },
    );
    if (!data.success) throw new Error("SUGGEST_LESS_NOT_PERSISTED");
  } catch (error) {
    if (previous) hiddenKeys.add(resourceKey);
    else hiddenKeys.delete(resourceKey);
    revision += 1;
    notify({ resourceType, resourceId, active: previous });
    throw error;
  }
}

export function subscribeSuggestLessChanges(
  listener: (detail: SuggestLessDetail) => void,
) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<SuggestLessDetail>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function clearSuggestLessStore() {
  hiddenKeys.clear();
  hydrated = false;
  hydrationRequest = null;
  revision += 1;
}
