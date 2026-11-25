"use client";

import { useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { requestEmailVerification } from "@/lib/auth/auth.api";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

export function useEmailVerificationRequest() {
  const inFlight = useRef(false);
  const [loading, setLoading] = useMinimumLoadingState();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendVerificationEmail() {
    if (inFlight.current) return;
    setMessage("");
    setError("");
    inFlight.current = true;
    setLoading(true);

    try {
      const result = await requestEmailVerification();
      setMessage(result.message || "Verification email sent.");
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Could not send verification email. Please try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return {
    loading,
    message,
    error,
    sendVerificationEmail,
  };
}
