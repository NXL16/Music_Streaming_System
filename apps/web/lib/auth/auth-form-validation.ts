import {
  AUTH_DISPLAY_NAME_MAX_LENGTH,
  AUTH_EMAIL_PATTERN,
  AUTH_PASSWORD_PATTERN,
  AUTH_USERNAME_PATTERN,
  AUTH_TWO_FACTOR_CODE_PATTERN,
  AUTH_RECOVERY_CODE_PATTERN,
} from "@musical/shared-constants";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/api-error";

export type LoginFormValues = { identifier: string; password: string };
export type SignupFormValues = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};
export type ResetPasswordFormValues = {
  newPassword: string;
  confirmPassword: string;
};
export type FieldErrors<T> = Partial<Record<keyof T, string>>;
export type AuthFormMode =
  "login" | "signup" | "two-factor" | "forgot-password" | "reset-password";

function validateNewPassword(password: string) {
  if (password.length < 8 || !AUTH_PASSWORD_PATTERN.test(password))
    return "Use at least 8 characters, including uppercase, lowercase, a number and one of @$!%*?&.";
}

export function validateResetPasswordForm(
  values: ResetPasswordFormValues,
): FieldErrors<ResetPasswordFormValues> {
  const errors: FieldErrors<ResetPasswordFormValues> = {};
  const passwordError = validateNewPassword(values.newPassword);
  if (passwordError) errors.newPassword = passwordError;
  if (!values.confirmPassword)
    errors.confirmPassword = "Confirm your new password.";
  else if (values.newPassword !== values.confirmPassword)
    errors.confirmPassword = "Passwords don't match.";
  return errors;
}

export function validateEmailForm({ email }: { email: string }) {
  const normalizedEmail = email.trim();
  return normalizedEmail.length > 255 ||
    !AUTH_EMAIL_PATTERN.test(normalizedEmail)
    ? { email: "Enter a valid email address." }
    : {};
}

export function validateVerificationForm(
  values: {
    verificationInput: string;
  },
  recoveryMode?: boolean,
) {
  const value = values.verificationInput.trim();
  if (recoveryMode !== true && AUTH_TWO_FACTOR_CODE_PATTERN.test(value))
    return {};
  if (recoveryMode !== false && AUTH_RECOVERY_CODE_PATTERN.test(value))
    return {};
  return {
    verificationInput: recoveryMode
      ? "Enter a valid recovery code."
      : "Enter your 6-digit verification code.",
  };
}

export function validateLoginForm(
  values: LoginFormValues,
): FieldErrors<LoginFormValues> {
  const errors: FieldErrors<LoginFormValues> = {};
  if (!values.identifier.trim())
    errors.identifier = "Enter your username or email.";
  if (!values.password) errors.password = "Enter your password.";
  return errors;
}

export function validateSignupForm(
  values: SignupFormValues,
): FieldErrors<SignupFormValues> {
  const errors: FieldErrors<SignupFormValues> = {};
  const name = values.displayName.trim();
  const username = values.username.trim();
  if (name.length < 2 || name.length > AUTH_DISPLAY_NAME_MAX_LENGTH)
    errors.displayName = `Use between 2 and ${AUTH_DISPLAY_NAME_MAX_LENGTH} characters for your name.`;
  if (
    username.length < 3 ||
    username.length > 50 ||
    !AUTH_USERNAME_PATTERN.test(username)
  )
    errors.username = "Use 3–50 letters, numbers or underscores.";
  Object.assign(errors, validateEmailForm(values));
  const passwordError = validateNewPassword(values.password);
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function authFormError(error: unknown, mode: AuthFormMode) {
  const status = getApiErrorStatus(error);
  if (status === 429)
    return getApiErrorMessage(
      error,
      "Too many attempts. Please wait a moment and try again.",
    );
  if (mode === "two-factor" && status === 409)
    return "Your sign-in session has expired. Sign in again.";
  if (mode === "two-factor" && status && status < 500)
    return "That code couldn't be verified. Check it and try again.";
  if (mode === "login" && (status === 401 || status === 403 || status === 400))
    return "Couldn't sign in. Check your username or email and password, then try again.";
  if (mode === "signup" && status === 409)
    return "An account with these details already exists. Try signing in or use different details.";
  if (mode === "signup" && status === 400)
    return "Check your details and try again.";
  if (mode === "forgot-password" && status === 400)
    return "Check your email address and try again.";
  if (mode === "reset-password" && status === 401)
    return "This reset link is invalid or has expired. Request a new link.";
  if (mode === "reset-password" && status === 400)
    return "Check your new password and try again.";
  return "We couldn't connect right now. Please try again in a moment.";
}

export function securityFormError(error: unknown, fallback: string) {
  return getApiErrorStatus(error) === 429
    ? getApiErrorMessage(error, "Too many attempts. Please try again later.")
    : fallback;
}
