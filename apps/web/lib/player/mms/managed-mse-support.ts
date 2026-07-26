const AUDIO_MIME = 'audio/mp4; codecs="mp4a.40.2"';

declare global {
  interface Window {
    ManagedMediaSource?: typeof MediaSource;
  }
}

export function canUseManagedMse(): boolean {
  if (typeof window === "undefined") return false;

  const ctor = window.ManagedMediaSource;

  return Boolean(ctor && ctor.isTypeSupported(AUDIO_MIME));
}
