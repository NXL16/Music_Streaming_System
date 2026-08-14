/**
 * Runs an expiration callback at an absolute time, including when a browser
 * throttles timers while the tab is in the background.
 */
export function scheduleRealtimeExpiry(
  expiresAt: number,
  onExpire: () => void,
) {
  let expired = false;
  let timeout: number | undefined;

  const cleanup = () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
  };

  const checkExpiry = () => {
    if (expired || Date.now() < expiresAt) return;
    expired = true;
    cleanup();
    onExpire();
  };

  const handleResume = () => {
    if (document.visibilityState !== "hidden") checkExpiry();
  };

  timeout = window.setTimeout(checkExpiry, Math.max(0, expiresAt - Date.now()));
  document.addEventListener("visibilitychange", handleResume);
  window.addEventListener("focus", handleResume);

  return cleanup;
}
