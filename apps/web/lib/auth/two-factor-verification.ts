import { AUTH_TWO_FACTOR_CODE_PATTERN } from "@musical/shared-constants";

export function resolveTwoFactorVerificationInput(value: string) {
  const verificationInput = value.trim();

  if (AUTH_TWO_FACTOR_CODE_PATTERN.test(verificationInput)) {
    return { code: verificationInput };
  }

  return { recoveryCode: verificationInput };
}
