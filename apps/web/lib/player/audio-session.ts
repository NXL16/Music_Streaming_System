type Session = { type: string };
let owners = 0;
let originalType: string | null = null;

export function acquirePlaybackAudioSession(): () => void {
  const session =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { audioSession?: Session }).audioSession;
  if (!session) return () => {};
  try {
    if (owners === 0) {
      originalType = session.type;
      session.type = "playback";
    }
    owners += 1;
  } catch {
    return () => {};
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners -= 1;
    if (!owners && originalType !== null) {
      try {
        if (session.type === "playback") session.type = originalType;
      } catch {
        /* Unsupported restoration. */
      }
      originalType = null;
    }
  };
}
