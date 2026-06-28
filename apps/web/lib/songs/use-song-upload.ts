"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { requestSongUpload, uploadSongFile } from "@/lib/songs/song.api";
import { notifySongLibraryChanged } from "@/lib/songs/song-library-events";
import {
  calculateFileSha256,
  getAudioTitleFromFile,
} from "@/lib/songs/file-checksum";

type UploadForm = {
  title: string;
  artist: string;
  album: string;
  isPublic: boolean;
};

const initialForm: UploadForm = {
  title: "",
  artist: "",
  album: "Single",
  isPublic: true,
};

type UploadStep =
  | "idle"
  | "hashing"
  | "requesting"
  | "uploading"
  | "waiting"
  | "done"
  | "error";

export function useSongUpload(options?: { onUploaded?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadForm>(initialForm);
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState("");
  const [songId, setSongId] = useState("");
  const [status, setStatus] = useState("");

  const loading =
    step === "hashing" || step === "requesting" || step === "uploading";

  function updateField<TField extends keyof UploadForm>(
    field: TField,
    value: UploadForm[TField],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setError("");
    setSongId("");
    setStatus("");
    setStep("idle");

    if (nextFile && !form.title) {
      setForm((current) => ({
        ...current,
        title: getAudioTitleFromFile(nextFile),
      }));
    }
  }

  function reset() {
    setFile(null);
    setForm(initialForm);
    setStep("idle");
    setError("");
    setSongId("");
    setStatus("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Please choose an audio file.");
      return;
    }

    setError("");
    setSongId("");
    setStatus("");

    try {
      setStep("hashing");
      const checksum = await calculateFileSha256(file);

      setStep("requesting");
      const uploadRequest = await requestSongUpload({
        title: form.title.trim() || getAudioTitleFromFile(file),
        artist: form.artist.trim() || "Unknown artist",
        album: form.album.trim() || "Single",
        isPublic: form.isPublic,
        checksum,
        size: file.size,
      });

      setSongId(uploadRequest.songId);
      notifySongLibraryChanged();

      if (uploadRequest.instant) {
        setStep("done");
        setStatus("READY");
        notifySongLibraryChanged();
        options?.onUploaded?.();
        return;
      }

      if (uploadRequest.uploadUrl) {
        setStep("uploading");
        await uploadSongFile(uploadRequest.uploadUrl, file);
      }

      setStep("waiting");
      setStatus(uploadRequest.status ?? "PROCESSING");
      notifySongLibraryChanged();
      options?.onUploaded?.();
    } catch (error) {
      setStep("error");
      setError(getApiErrorMessage(error, "Cannot upload this song."));
    }
  }

  return {
    error,
    file,
    form,
    loading,
    songId,
    status,
    step,
    handleSubmit,
    reset,
    selectFile,
    updateField,
  };
}
