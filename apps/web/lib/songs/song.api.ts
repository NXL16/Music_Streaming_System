import { http } from "@/lib/api/http";
import type {
  DeleteSongResponse,
  GetSongResponse,
  ListSongsResponse,
  RequestUploadPayload,
  RequestUploadResponse,
} from "./song.types";

export async function listPublicSongs(params?: {
  cursor?: string;
  limit?: number;
}) {
  const response = await http.get<ListSongsResponse>("/songs", {
    params: {
      cursor: params?.cursor,
      limit: params?.limit ?? 20,
    },
  });

  return response.data;
}

export async function listMySongs(params?: {
  cursor?: string;
  limit?: number;
  search?: string;
  artist?: string;
}) {
  const response = await http.get<ListSongsResponse>("/songs/me", {
    params: {
      cursor: params?.cursor,
      limit: params?.limit ?? 20,
      search: params?.search,
      artist: params?.artist,
    },
  });

  return response.data;
}

export async function getMySong(songId: string) {
  const response = await http.get<GetSongResponse>(`/songs/private/${songId}`);

  return response.data;
}

export async function getSongStreamUrl(songId: string) {
  const response = await http.get<{
    streamUrl: string;
    key: string;
    iv: string;
  }>(`/stream/${encodeURIComponent(songId)}`);

  return response.data;
}

export async function requestSongUpload(payload: RequestUploadPayload) {
  const response = await http.post<RequestUploadResponse>(
    "/songs/request-upload",
    payload,
  );

  return response.data;
}

export async function uploadSongFile(
  uploadUrl: string,
  file: File,
  signal?: AbortSignal,
) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: file,
    signal,
  });

  if (!response.ok) {
    throw new Error(`UPLOAD_FILE_FAILED status=${response.status}`);
  }
}

export async function deleteMySong(songId: string) {
  const response = await http.delete<DeleteSongResponse>(`/songs/${songId}`);

  return response.data;
}
