// One scheduler owns the browser's bounded ambient-video decoder budget.
// Cards declare intent; they never race each other to start a decoder.
const MAX_CONCURRENT_VIDEOS = 10;
const MAX_WARM_VIDEOS = 4;

type VideoRequest = {
  activate: () => void;
  evict: () => void;
  interactionPriority: number;
  sequence: number;
};

type WarmVideoEntry = { destroy: () => void; sequence: number };

const activeVideos = new Map<symbol, VideoRequest>();
const pendingVideos = new Map<symbol, VideoRequest>();
const warmVideos = new Map<symbol, WarmVideoEntry>();
let sequence = 0;

function takeNextPendingVideo() {
  let next: [symbol, VideoRequest] | undefined;
  for (const entry of pendingVideos) {
    if (
      !next ||
      entry[1].interactionPriority > next[1].interactionPriority ||
      (entry[1].interactionPriority === next[1].interactionPriority &&
        entry[1].sequence < next[1].sequence)
    ) {
      next = entry;
    }
  }
  return next;
}

function findLowestPriorityActiveVideo() {
  let lowest: [symbol, VideoRequest] | undefined;
  for (const entry of activeVideos) {
    if (
      !lowest ||
      entry[1].interactionPriority < lowest[1].interactionPriority ||
      (entry[1].interactionPriority === lowest[1].interactionPriority &&
        entry[1].sequence < lowest[1].sequence)
    ) {
      lowest = entry;
    }
  }
  return lowest;
}

function removeOldestWarmVideo() {
  if (warmVideos.size <= MAX_WARM_VIDEOS) return;

  let oldest: [symbol, WarmVideoEntry] | undefined;
  for (const entry of warmVideos) {
    if (!oldest || entry[1].sequence < oldest[1].sequence) oldest = entry;
  }
  if (!oldest) return;

  warmVideos.delete(oldest[0]);
  oldest[1].destroy();
}

function promotePendingVideos() {
  while (activeVideos.size < MAX_CONCURRENT_VIDEOS && pendingVideos.size > 0) {
    const next = takeNextPendingVideo();
    if (!next) return;

    const [id, request] = next;
    pendingVideos.delete(id);
    activeVideos.set(id, request);
    request.activate();
  }
}

function requestSlot(id: symbol, request: VideoRequest) {
  warmVideos.delete(id);
  const active = activeVideos.get(id);
  if (active) {
    active.activate = request.activate;
    active.evict = request.evict;
    active.interactionPriority = request.interactionPriority;
    active.sequence = request.sequence;
    active.activate();
    return;
  }

  pendingVideos.set(id, request);
  if (activeVideos.size < MAX_CONCURRENT_VIDEOS) {
    promotePendingVideos();
    return;
  }

  const lowestPriorityActive = findLowestPriorityActiveVideo();
  if (!lowestPriorityActive) return;

  const [activeId, activeRequest] = lowestPriorityActive;
  if (request.interactionPriority <= activeRequest.interactionPriority) return;

  activeVideos.delete(activeId);
  activeRequest.evict();
  promotePendingVideos();
}

/** Schedules ambient cards without decoder-start races or stranded requests. */
export const ambientVideoManager = {
  request(
    id: symbol,
    activate: () => void,
    evict: () => void,
    interactionPriority = 0,
  ) {
    requestSlot(id, {
      activate,
      evict,
      interactionPriority,
      sequence: ++sequence,
    });
  },

  suspend(id: symbol, destroy: () => void) {
    pendingVideos.delete(id);
    activeVideos.delete(id);
    warmVideos.set(id, { destroy, sequence: ++sequence });
    removeOldestWarmVideo();
    promotePendingVideos();
  },

  release(id: symbol) {
    pendingVideos.delete(id);
    activeVideos.delete(id);
    warmVideos.delete(id);
    promotePendingVideos();
    if (
      activeVideos.size === 0 &&
      pendingVideos.size === 0 &&
      warmVideos.size === 0
    ) {
      sequence = 0;
    }
  },

  updateInteractionPriority(id: symbol, interactionPriority: number) {
    const request = activeVideos.get(id) ?? pendingVideos.get(id);
    if (!request) return;

    request.interactionPriority = interactionPriority;
    request.sequence = ++sequence;
    if (!activeVideos.has(id)) promotePendingVideos();
  },

  isActive(id: symbol) {
    return activeVideos.has(id);
  },
};
