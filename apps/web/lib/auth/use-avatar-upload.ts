"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

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
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function getAvatarValidationError(file: File) {
  if (!AVATAR_CONTENT_TYPES.has(file.type)) {
    return "Ảnh đại diện phải là JPEG, PNG, WebP hoặc AVIF.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "Ảnh đại diện tối đa 5 MB.";
  }

  return null;
}

export function useAvatarUpload() {
  const setUser = useAuthStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function uploadAvatar(file: File) {
    const validationError = getAvatarValidationError(file);
    if (validationError) {
      setError(validationError);
      return false;
    }

    setError("");
    setLoading(true);

    try {
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
          throw new Error("Không thể tải ảnh đại diện lên kho lưu trữ.");
        }
      }

      for (let attempt = 0; attempt < 45; attempt += 1) {
        const finalized = await finalizeAvatarUpload(upload.data.asset.id);
        if (finalized.data.asset.status === READY_STATUS && finalized.data.user) {
          setUser(finalized.data.user);
          return true;
        }

        if (finalized.data.asset.status !== PROCESSING_STATUS) {
          throw new Error(
            finalized.data.asset.errorMessage ||
              "Không thể xử lý ảnh đại diện.",
          );
        }

        await wait(1_000);
      }

      throw new Error("Xử lý ảnh đại diện mất quá lâu, vui lòng thử lại.");
    } catch (uploadError) {
      setError(
        getApiErrorMessage(
          uploadError,
          "Không thể thay ảnh đại diện, vui lòng thử lại.",
        ),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { error, loading, uploadAvatar };
}
