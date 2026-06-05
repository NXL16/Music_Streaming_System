"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { requestEmailVerification } from "@/lib/auth/auth.api";

export function useEmailVerificationRequest() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendVerificationEmail() {
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const result = await requestEmailVerification();
      setMessage(result.message || "Đã gửi email xác thực.");
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Không thể gửi email xác thực."),
      );
    } finally {
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
