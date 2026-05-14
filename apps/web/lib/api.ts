import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Attach JWT token vào mọi request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type StreamUrlResponse = {
  url: string;
};

export async function getStreamUrl(songId: string): Promise<string> {
  const res = await api.get<StreamUrlResponse>(`/stream/${songId}`);
  return res.data.url;
}

export default api;
