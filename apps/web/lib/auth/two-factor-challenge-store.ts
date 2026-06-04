const TWO_FACTOR_CHALLENGE_ID_KEY = "2fa_challenge_id";

export function saveTwoFactorChallengeId(challengeId: string) {
  sessionStorage.setItem(TWO_FACTOR_CHALLENGE_ID_KEY, challengeId);
}

export function getTwoFactorChallengeId() {
  return sessionStorage.getItem(TWO_FACTOR_CHALLENGE_ID_KEY);
}

export function clearTwoFactorChallengeId() {
  sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_ID_KEY);
}
