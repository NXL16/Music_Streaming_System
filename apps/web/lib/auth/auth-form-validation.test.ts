import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import {
  authFormError,
  securityFormError,
  validateLoginForm,
  validateSignupForm,
  validateVerificationForm,
  validateEmailForm,
  validateResetPasswordForm,
} from "./auth-form-validation";

const valid = {
  displayName: "Music Listener",
  username: "listener_1",
  email: "listener@example.test",
  password: "Music123!",
};

describe("Auth form validation", () => {
  it("uses the English security message instead of raw server errors", () => {
    const fallback = "Could not verify your code. Please try again.";
    expect(
      securityFormError(new Error("Internal server detail"), fallback),
    ).toBe(fallback);
  });

  it("keeps the API wait message when security requests are rate limited", () => {
    const error = new AxiosError("Rate limited");
    error.response = {
      status: 429,
      data: { message: "Too many requests. Try again in 3 minutes." },
    } as NonNullable<AxiosError["response"]>;
    expect(securityFormError(error, "Try again.")).toBe(
      "Too many requests. Try again in 3 minutes.",
    );
  });
  it("requires both reset fields", () => {
    expect(
      validateResetPasswordForm({ newPassword: "", confirmPassword: "" }),
    ).toHaveProperty("newPassword");
    expect(
      validateResetPasswordForm({ newPassword: "", confirmPassword: "" }),
    ).toHaveProperty("confirmPassword");
  });

  it("rejects mismatched reset passwords without trimming them", () => {
    expect(
      validateResetPasswordForm({
        newPassword: "Music123! ",
        confirmPassword: "Music123!",
      }),
    ).toEqual({ confirmPassword: "Passwords don't match." });
  });

  it("rejects matching reset passwords that do not satisfy the password policy", () => {
    expect(
      validateResetPasswordForm({
        newPassword: "music123!",
        confirmPassword: "music123!",
      }).newPassword,
    ).toBeTruthy();
  });

  it("accepts matching valid reset passwords", () => {
    expect(
      validateResetPasswordForm({
        newPassword: "Music123!",
        confirmPassword: "Music123!",
      }),
    ).toEqual({});
  });
  it.each(["", " ", "not-an-email", "listener@"])(
    "rejects invalid recovery email %j",
    (email) => {
      expect(validateEmailForm({ email }).email).toBeTruthy();
    },
  );

  it("accepts a recovery email with surrounding whitespace", () => {
    expect(validateEmailForm({ email: " Listener@example.test " })).toEqual({});
  });
  it.each([
    [50, true],
    [51, false],
  ] as const)(
    "validates the display name boundary at %i characters",
    (length, accepted) => {
      expect(
        !validateSignupForm({ ...valid, displayName: "x".repeat(length) })
          .displayName,
      ).toBe(accepted);
    },
  );
  it.each([
    "login",
    "signup",
    "two-factor",
    "forgot-password",
    "reset-password",
  ] as const)("preserves the backend rate-limit wait time for %s", (mode) => {
    const message = "Too many sign-in attempts. Try again in 8 minutes.";
    const error = new AxiosError(
      "Request failed with status code 429",
      undefined,
      undefined,
      undefined,
      { status: 429, data: { code: "GRPC_8", message } } as never,
    );
    expect(authFormError(error, mode)).toBe(message);
  });
  it("preserves the API gateway rate-limit message", () => {
    const message = "Too many requests. Please try again later.";
    const error = new AxiosError(
      "Request failed with status code 429",
      undefined,
      undefined,
      undefined,
      {
        status: 429,
        data: { code: "AUTH_TOO_MANY_REQUESTS", message },
      } as never,
    );
    expect(authFormError(error, "login")).toBe(message);
  });
  it("falls back to a friendly message when a 429 has no response message", () => {
    const error = new AxiosError(
      "Request failed with status code 429",
      undefined,
      undefined,
      undefined,
      { status: 429, data: {} } as never,
    );
    expect(authFormError(error, "login")).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });
  it("requires a verification code while accepting both code and recovery flows", () => {
    expect(validateVerificationForm({ verificationInput: " " })).toHaveProperty(
      "verificationInput",
    );
    expect(validateVerificationForm({ verificationInput: "123456" })).toEqual(
      {},
    );
    expect(
      validateVerificationForm({ verificationInput: "ABCD-EFGH-IJKL-MNOP" }),
    ).toEqual({});
  });
  it("validates the selected 2FA method instead of interpreting malformed codes as recovery codes", () => {
    expect(
      validateVerificationForm({ verificationInput: "12345" }, false)
        .verificationInput,
    ).toBeTruthy();
    expect(
      validateVerificationForm({ verificationInput: "123456" }, true)
        .verificationInput,
    ).toBeTruthy();
    expect(
      validateVerificationForm(
        { verificationInput: "ABCD-EFGH-IJKL-MNOP" },
        true,
      ),
    ).toEqual({});
  });
  it("marks every empty registration field instead of depending on HTML validation", () => {
    expect(
      Object.keys(
        validateSignupForm({
          displayName: " ",
          username: "",
          email: "",
          password: "",
        }),
      ),
    ).toHaveLength(4);
  });
  it("accepts valid details and surrounding whitespace on identity fields", () => {
    expect(
      validateSignupForm({
        ...valid,
        displayName: " Music Listener ",
        username: " listener_1 ",
        email: " listener@example.test ",
      }),
    ).toEqual({});
  });
  it.each(["short", "music123!", "MUSIC123!", "MusicOnly!", "Music123#"])(
    "rejects password %s according to the existing server policy",
    (password) => {
      expect(validateSignupForm({ ...valid, password }).password).toBeTruthy();
    },
  );
  it.each(["bad name", "ab", "x".repeat(51)])(
    "rejects invalid username %s",
    (username) => {
      expect(validateSignupForm({ ...valid, username }).username).toBeTruthy();
    },
  );
  it("does not impose the signup password policy on existing login credentials", () => {
    expect(
      validateLoginForm({
        identifier: "old-user",
        password: "legacy-password",
      }),
    ).toEqual({});
    expect(validateLoginForm({ identifier: " ", password: "" })).toHaveProperty(
      "identifier",
    );
  });
  it("does not expose raw service errors or distinguish a missing user from a wrong password", () => {
    const error = new AxiosError(
      "Database connection failed",
      undefined,
      undefined,
      undefined,
      { status: 401, data: { message: "User does not exist" } } as never,
    );
    expect(authFormError(error, "login")).not.toContain("User does not exist");
    expect(
      authFormError(new Error("Internal server detail"), "signup"),
    ).not.toContain("Internal");
  });
});
