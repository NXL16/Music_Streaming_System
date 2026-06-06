export function resolveTwoFactorVerificationInput(value: string) {
  const verificationInput = value.trim();

  if (/^\d{6}$/.test(verificationInput)) {
    return { code: verificationInput };
  }

  return { recoveryCode: verificationInput };
}
