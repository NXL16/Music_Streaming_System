"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { updateProfile } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type ProfileDetails = {
  displayName: string;
  bio?: string;
};

export function useProfileDetailsUpdate() {
  const setUser = useAuthStore((state) => state.setUser);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveProfileDetails({ displayName, bio }: ProfileDetails) {
    const normalizedName = displayName.trim();
    const normalizedBio = bio?.trim();

    if (normalizedName.length < 2 || normalizedName.length > 100) {
      setError("Tên hiển thị cần có từ 2 đến 100 ký tự.");
      return false;
    }

    if (normalizedBio && normalizedBio.length > 500) {
      setError("Giới thiệu tối đa 500 ký tự.");
      return false;
    }

    setError("");
    setLoading(true);

    try {
      const result = await updateProfile({
        displayName: normalizedName,
        bio: normalizedBio || undefined,
      });
      setUser(result.data);
      return true;
    } catch (saveError) {
      setError(
        getApiErrorMessage(
          saveError,
          "Không thể cập nhật hồ sơ, vui lòng thử lại.",
        ),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { error, loading, saveProfileDetails };
}
