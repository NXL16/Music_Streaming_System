"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  finalizeAvatarUpload,
  requestAvatarUpload,
  updateProfile,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

type EditProfileForm = {
  displayName: string;
  bio: string;
};

const initialForm: EditProfileForm = {
  displayName: "",
  bio: "",
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const PROCESSING_STATUS = 2;
const READY_STATUS = 3;

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

export function useEditProfileForm(onSaved?: () => void) {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [form, setForm] = useState<EditProfileForm>(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useMinimumLoadingState();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    queueMicrotask(() =>
      setForm({
        displayName: user.displayName,
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

  function selectAvatar(file: File | null) {
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!AVATAR_CONTENT_TYPES.has(file.type)) {
      setAvatarFile(null);
      setError("Avatar phải là ảnh JPEG, PNG, WebP hoặc AVIF");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarFile(null);
      setError("Avatar tối đa 5 MB");
      return;
    }
    setError("");
    setAvatarFile(file);
  }

  async function uploadAvatar(file: File) {
    const upload = await requestAvatarUpload({
      filename: file.name,
      contentType: file.type,
      checksum: await sha256(file),
      sizeBytes: file.size,
    });
    if (upload.data.uploadUrl) {
      const response = await fetch(upload.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error("Không thể tải ảnh đại diện lên kho lưu trữ");
      }
    }

    for (let attempt = 0; attempt < 45; attempt += 1) {
      const finalized = await finalizeAvatarUpload(upload.data.asset.id);
      if (finalized.data.asset.status === READY_STATUS && finalized.data.user) {
        return finalized.data.user;
      }
      if (finalized.data.asset.status !== PROCESSING_STATUS) {
        throw new Error(
          finalized.data.asset.errorMessage || "Không thể xử lý ảnh đại diện",
        );
      }
      await wait(1_000);
    }
    throw new Error("Xử lý ảnh đại diện mất quá lâu, vui lòng thử lại sau");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim() || undefined,
      });

      setUser(result.data);
      if (avatarFile) {
        setUser(await uploadAvatar(avatarFile));
      }
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
    avatarFile,
    updateField,
    selectAvatar,
    handleSubmit,
  };
}
