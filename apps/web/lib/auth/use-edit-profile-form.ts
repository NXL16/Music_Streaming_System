"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { updateProfile } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type EditProfileForm = {
  displayName: string;
  avatar: string;
  bio: string;
};

const initialForm: EditProfileForm = {
  displayName: "",
  avatar: "",
  bio: "",
};

export function useEditProfileForm(onSaved?: () => void) {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [form, setForm] = useState<EditProfileForm>(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    queueMicrotask(() =>
      setForm({
        displayName: user.displayName,
        avatar: user.avatar ?? "",
        bio: user.bio ?? "",
      }),
    );
  }, [user]);

  function updateField<TField extends keyof EditProfileForm>(
    field: TField,
    value: EditProfileForm[TField],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await updateProfile({
        displayName: form.displayName.trim(),
        avatar: form.avatar.trim() || undefined,
        bio: form.bio.trim() || undefined,
      });

      setUser(result.data);
      onSaved?.();
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Không thể cập nhật hồ sơ, vui lòng thử lại sau",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    form,
    error,
    loading,
    updateField,
    handleSubmit,
  };
}
