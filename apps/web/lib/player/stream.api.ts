import { http } from "@/lib/api/http";
import type { StreamInfo, StreamMetadata } from "./mse/types";

export async function getStreamInfo(songId: string): Promise<StreamInfo> {
  const response = await http.get<StreamInfo>(
    `/stream/${encodeURIComponent(songId)}`,
  );
  return response.data;
}

export async function getStreamMetadata(
  songId: string,
): Promise<StreamMetadata> {
  const response = await http.get<StreamMetadata>(
    `/metadata/${encodeURIComponent(songId)}`,
  );
  return response.data;
}
