"use client";

import { useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { finalizeAvatarUpload, requestAvatarUpload } from "@/lib/auth/auth.api";
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
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

function getAvatarValidationError(file: File) {
  if (!AVATAR_CONTENT_TYPES.has(file.type)) {
    return "Choose a JPEG, PNG, WebP or AVIF image.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "Choose an image no larger than 5 MB.";
  }

  return null;
}

export function useAvatarUpload() {
  const inFlight = useRef(false);
  const setUser = useAuthStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function uploadAvatar(file: File) {
    if (inFlight.current) return false;
    const validationError = getAvatarValidationError(file);
    if (validationError) {
      setError(validationError);
      return false;
    }

    setError("");
    inFlight.current = true;
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
          throw new Error("Could not upload your profile picture.");
        }
      }

      for (let attempt = 0; attempt < 45; attempt += 1) {
        const finalized = await finalizeAvatarUpload(upload.data.asset.id);
        if (
          finalized.data.asset.status === READY_STATUS &&
          finalized.data.user
        ) {
          setUser(finalized.data.user);
          return true;
        }

        if (finalized.data.asset.status !== PROCESSING_STATUS) {
          throw new Error(
            finalized.data.asset.errorMessage ||
              "Could not process your profile picture.",
          );
        }

        await wait(1_000);
      }

      throw new Error("Image processing timed out. Please try again.");
    } catch (uploadError) {
      setError(
        getApiErrorMessage(
          uploadError,
          "Could not change your profile picture. Please try again.",
        ),
      );
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { error, loading, uploadAvatar };
}
