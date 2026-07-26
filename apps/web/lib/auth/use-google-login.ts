"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithGoogle } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";
import { saveTwoFactorChallengeId } from "@/lib/auth/two-factor-challenge-store";
import type { GoogleCodeResponse } from "./google-identity.types";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const IN_APP_BROWSER_PATTERN = /zalo|fban|fbav|instagram|line|micromessenger|tiktok/i;

const EMBEDDED_BROWSER_GOOGLE_LOGIN_MESSAGE =
  "Google sign-in is unavailable in this in-app browser. Open this page in Safari or Chrome, then try again.";

function isInAppBrowser() {
  return IN_APP_BROWSER_PATTERN.test(navigator.userAgent);
}

function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT_SRC}"]`,
    );

    if (existingScript) {
      if (existingScript.dataset.googleIdentityStatus === "failed") {
        reject(new Error("Google Identity is unavailable"));
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google Identity is unavailable")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.googleIdentityStatus = "loaded";
      resolve();
    };
    script.onerror = () => {
      script.dataset.googleIdentityStatus = "failed";
      reject(new Error("Google Identity is unavailable"));
    };

    document.head.appendChild(script);
  });
}

export function useGoogleLogin() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function startGoogleLogin() {
    setGoogleError(null);

    if (isInAppBrowser()) {
      setGoogleError(EMBEDDED_BROWSER_GOOGLE_LOGIN_MESSAGE);
      return;
    }

    setGoogleLoading(true);

    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

      if (!clientId) {
        setGoogleError("Google sign-in is not configured.");
        setGoogleLoading(false);
        return;
      }

      await loadGoogleIdentityScript();

      const codeClient = window.google?.accounts?.oauth2?.initCodeClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: async (response: GoogleCodeResponse) => {
          try {
            if (!response.code) {
              setGoogleError(
                response.error_description ?? "Google sign-in was not completed.",
              );
              setGoogleLoading(false);
              return;
            }

            const result = await loginWithGoogle({
              code: response.code,
              deviceId: getOrCreateDeviceId(),
            });

            if (result.data.twoFactorRequired) {
              if (result.data.twoFactorChallengeId) {
                saveTwoFactorChallengeId(result.data.twoFactorChallengeId);
              }

              router.push("/login/2fa");
              return;
            }

            setSession(
              result.data.accessToken,
              result.data.user,
              result.data.expiresIn,
            );
            router.push("/home");
          } catch {
            setGoogleError("Google sign-in failed. Please try again.");
          } finally {
            setGoogleLoading(false);
          }
        },
        error_callback: () => {
          setGoogleError("Google sign-in was cancelled or is unavailable in this browser.");
          setGoogleLoading(false);
        },
      });

      codeClient?.requestCode();
    } catch {
      setGoogleError(EMBEDDED_BROWSER_GOOGLE_LOGIN_MESSAGE);
      setGoogleLoading(false);
    }
  }

  return {
    googleError,
    googleLoading,
    startGoogleLogin,
  };
}
