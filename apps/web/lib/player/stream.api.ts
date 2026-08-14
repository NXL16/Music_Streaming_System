import { http } from "@/lib/api/http";
import type { StreamInfo, StreamMetadata } from "./mse/types";

export async function getStreamInfo(
  songId: string,
  signal?: AbortSignal,
): Promise<StreamInfo> {
  const response = await http.get<StreamInfo>(
    `/stream/${encodeURIComponent(songId)}`,
    { signal },
  );
  return response.data;
}

export async function getStreamMetadata(
  songId: string,
  signal?: AbortSignal,
): Promise<StreamMetadata> {
  const response = await http.get<StreamMetadata>(
    `/metadata/${encodeURIComponent(songId)}`,
    { signal },
  );
  return response.data;
}
