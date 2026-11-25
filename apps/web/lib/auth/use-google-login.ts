"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithGoogle } from "./auth.api";
import { useAuthStore } from "./auth-store";
import { getOrCreateDeviceId } from "./device-id";
import { saveTwoFactorChallengeId } from "./two-factor-challenge-store";
import type { GoogleCodeResponse } from "./google-identity.types";
import { loadGoogleIdentityScript } from "./google-identity-script";
import { getApiErrorStatus } from "@/lib/api/api-error";
import { authFormError } from "./auth-form-validation";

const IN_APP_BROWSER_PATTERN =
  /zalo|fban|fbav|instagram|line|micromessenger|tiktok/i;

export function useGoogleLogin() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function finish(error?: string) {
    if (error) setGoogleError(error);
    inFlight.current = false;
    setGoogleLoading(false);
  }

  async function startGoogleLogin() {
    if (inFlight.current) return;
    setGoogleError(null);
    if (IN_APP_BROWSER_PATTERN.test(navigator.userAgent)) {
      setGoogleError(
        "Open this page in Safari or Chrome to continue with Google.",
      );
      return;
    }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGoogleError(
        "Google sign-in is temporarily unavailable. Please use your username and password.",
      );
      return;
    }
    inFlight.current = true;
    setGoogleLoading(true);

    try {
      await loadGoogleIdentityScript();
      const codeClient = window.google?.accounts?.oauth2?.initCodeClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: async (response: GoogleCodeResponse) => {
          try {
            if (response.error === "access_denied") return;
            if (!response.code)
              throw new Error("Google sign-in wasn't completed");
            const result = await loginWithGoogle({
              code: response.code,
              deviceId: getOrCreateDeviceId(),
            });
            if (result.data.twoFactorRequired) {
              if (!result.data.twoFactorChallengeId)
                throw new Error("Missing authentication challenge");
              saveTwoFactorChallengeId(result.data.twoFactorChallengeId);
              router.push("/login/2fa");
              return;
            }
            setSession(
              result.data.accessToken,
              result.data.user,
              result.data.expiresIn,
            );
            router.replace("/home");
          } catch (error) {
            setGoogleError(
              getApiErrorStatus(error) === 429
                ? authFormError(error, "login")
                : "Google sign-in failed. Please try again.",
            );
          } finally {
            finish();
          }
        },
        error_callback: ({ type }) => {
          if (type === "popup_closed") {
            finish();
            return;
          }
          finish(
            type === "popup_failed_to_open"
              ? "Allow pop-ups to continue with Google."
              : "Couldn't open Google sign-in. Please try again.",
          );
        },
      });
      if (!codeClient) throw new Error("Google sign-in is unavailable");
      codeClient.requestCode();
    } catch {
      finish("Couldn't connect to Google. Please try again.");
    }
  }

  return {
    googleError,
    googleLoading,
    clearGoogleError: () => setGoogleError(null),
    startGoogleLogin,
  };
}
