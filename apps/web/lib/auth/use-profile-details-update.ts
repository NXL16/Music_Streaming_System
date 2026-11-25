"use client";

import { useRef, useState } from "react";
import { AUTH_DISPLAY_NAME_MAX_LENGTH } from "@musical/shared-constants";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { updateProfile } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type ProfileDetails = {
  displayName: string;
  bio?: string;
};

export function useProfileDetailsUpdate() {
  const inFlight = useRef(false);
  const setUser = useAuthStore((state) => state.setUser);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveProfileDetails({ displayName, bio }: ProfileDetails) {
    if (inFlight.current) return false;
    const normalizedName = displayName.trim();
    const normalizedBio = bio?.trim();

    if (
      normalizedName.length < 2 ||
      normalizedName.length > AUTH_DISPLAY_NAME_MAX_LENGTH
    ) {
      setError("Use between 2 and 50 characters for your name.");
      return false;
    }

    if (normalizedBio && normalizedBio.length > 500) {
      setError("Use no more than 500 characters for your bio.");
      return false;
    }

    setError("");
    inFlight.current = true;
    setLoading(true);

    try {
      const result = await updateProfile({
        displayName: normalizedName,
        bio: normalizedBio,
      });
      setUser(result.data);
      return true;
    } catch (saveError) {
      setError(
        getApiErrorMessage(
          saveError,
          "Could not update your profile. Please try again.",
        ),
      );
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { error, loading, saveProfileDetails, clearError: () => setError("") };
}
