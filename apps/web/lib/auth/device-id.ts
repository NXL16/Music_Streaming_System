const DEVICE_ID_KEY = "musical_device_id";

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return undefined;

  const current = localStorage.getItem(DEVICE_ID_KEY);

  if (current) return current;

  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);

  return next;
}
