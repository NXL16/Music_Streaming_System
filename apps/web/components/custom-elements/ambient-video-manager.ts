// Keep several visible hero cards animated, while retaining a bounded decoder
// and buffer budget for the whole page.
const MAX_CONCURRENT_VIDEOS = 10;
const MAX_WARM_VIDEOS = 4;

type WarmVideoEntry = { destroy: () => void; priority: number };
type ActiveVideoEntry = {
  evict: () => void;
  priority: number;
  interactionPriority: number;
};

const warmVideos = new Map<symbol, WarmVideoEntry>();
const activeVideos = new Map<symbol, ActiveVideoEntry>();
let prioritySequence = 0;

function evictOldestWarmVideo() {
  if (warmVideos.size <= MAX_WARM_VIDEOS) return;

  let oldest: [symbol, WarmVideoEntry] | undefined;
  for (const entry of warmVideos) {
    if (!oldest || entry[1].priority < oldest[1].priority) oldest = entry;
  }
  if (!oldest) return;

  warmVideos.delete(oldest[0]);
  oldest[1].destroy();
}

/** Limits active decoders and keeps recently suspended card videos warm. */
export const ambientVideoManager = {
  request(
    id: symbol,
    activate: () => void,
    evict: () => void,
    interactionPriority = 0,
  ) {
    warmVideos.delete(id);
    const current = activeVideos.get(id);
    if (current) {
      current.priority = ++prioritySequence;
      current.interactionPriority = interactionPriority;
      activate();
      return true;
    }

    if (activeVideos.size >= MAX_CONCURRENT_VIDEOS) {
      let candidate: [symbol, ActiveVideoEntry] | undefined;
      for (const entry of activeVideos) {
        if (
          !candidate ||
          entry[1].interactionPriority < candidate[1].interactionPriority ||
          (entry[1].interactionPriority === candidate[1].interactionPriority &&
            entry[1].priority < candidate[1].priority)
        ) {
          candidate = entry;
        }
      }
      if (candidate) {
        const [candidateId, candidateVideo] = candidate;
        // Automatic viewport requests must never churn the active MSE player.
        // A hero shelf can make several cards intersect at once; replacing the
        // current player for each of them repeatedly destroys and recreates
        // video buffers while the user is scrolling. Only an explicitly more
        // important interaction (such as hovering a card) may take over.
        if (candidateVideo.interactionPriority >= interactionPriority) {
          return false;
        }
        candidateVideo.evict();
        activeVideos.delete(candidateId);
      }
    }

    activeVideos.set(id, {
      evict,
      priority: ++prioritySequence,
      interactionPriority,
    });
    activate();
    return true;
  },

  suspend(id: symbol, destroy: () => void) {
    activeVideos.delete(id);
    warmVideos.delete(id);
    warmVideos.set(id, { destroy, priority: ++prioritySequence });
    evictOldestWarmVideo();
  },

  release(id: symbol) {
    activeVideos.delete(id);
    warmVideos.delete(id);
    if (activeVideos.size === 0 && warmVideos.size === 0) prioritySequence = 0;
  },

  updateInteractionPriority(id: symbol, interactionPriority: number) {
    const entry = activeVideos.get(id);
    if (!entry) return;
    entry.interactionPriority = interactionPriority;
    entry.priority = ++prioritySequence;
  },

  isActive(id: symbol) {
    return activeVideos.has(id);
  },
};
