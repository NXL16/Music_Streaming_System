import { AUTH_TWO_FACTOR_CHALLENGE_TTL_SECONDS } from "@musical/shared-constants";

const TWO_FACTOR_CHALLENGE_ID_KEY = "2fa_challenge_id";
const TWO_FACTOR_CHALLENGE_EXPIRY_KEY = "2fa_challenge_expires_at";
const CHALLENGE_CHANGED_EVENT = "auth:two-factor-challenge-changed";

export function saveTwoFactorChallengeId(challengeId: string) {
  sessionStorage.setItem(TWO_FACTOR_CHALLENGE_ID_KEY, challengeId);
  sessionStorage.setItem(
    TWO_FACTOR_CHALLENGE_EXPIRY_KEY,
    String(Date.now() + AUTH_TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000),
  );
  window.dispatchEvent(new Event(CHALLENGE_CHANGED_EVENT));
}

export function getTwoFactorChallengeId() {
  if (typeof window === "undefined") return null;
  const expiresAt = Number(
    sessionStorage.getItem(TWO_FACTOR_CHALLENGE_EXPIRY_KEY),
  );
  return expiresAt > Date.now()
    ? sessionStorage.getItem(TWO_FACTOR_CHALLENGE_ID_KEY)
    : null;
}

export function clearTwoFactorChallengeId() {
  sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_ID_KEY);
  sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_EXPIRY_KEY);
  window.dispatchEvent(new Event(CHALLENGE_CHANGED_EVENT));
}

export function subscribeTwoFactorChallenge(listener: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timer) clearTimeout(timer);
    listener();
    const remaining =
      Number(sessionStorage.getItem(TWO_FACTOR_CHALLENGE_EXPIRY_KEY)) -
      Date.now();
    if (remaining > 0) timer = setTimeout(listener, remaining);
  };
  window.addEventListener(CHALLENGE_CHANGED_EVENT, notify);
  window.addEventListener("storage", notify);
  notify();
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener(CHALLENGE_CHANGED_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}
