"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithGoogle } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";
import { saveTwoFactorChallengeId } from "@/lib/auth/two-factor-challenge-store";
import type { GoogleCodeResponse } from "./google-identity.types";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

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
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Cannot load Google script"));

    document.head.appendChild(script);
  });
}

export function useGoogleLogin() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [googleLoading, setGoogleLoading] = useState(false);

  async function startGoogleLogin() {
    setGoogleLoading(true);

    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

      if (!clientId) {
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
          } catch (error) {
            console.error("Google login callback failed", error);
          } finally {
            setGoogleLoading(false);
          }
        },
        error_callback: () => {
          setGoogleLoading(false);
        },
      });

      codeClient?.requestCode();
    } catch (error) {
      console.error("Cannot start Google login", error);
      setGoogleLoading(false);
    }
  }

  return {
    googleLoading,
    startGoogleLogin,
  };
}
