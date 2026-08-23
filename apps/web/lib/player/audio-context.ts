/**
 * Resume inside the caller's user-activation turn whenever possible. iOS
 * Safari may reject a resume deferred to a React effect after a tap/lock-screen
 * action, leaving a MediaElementSource advancing silently.
 */
export function resumeAudioContext(context: AudioContext | null): void {
  if (!context || context.state === "running" || context.state === "closed") {
    return;
  }
  void context.resume().catch(() => {
    // The media element play promise remains the authoritative autoplay error.
  });
}
