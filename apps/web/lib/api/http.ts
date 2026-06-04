import axios from "axios";
import { getAccessToken } from "@/lib/auth/access-token-store";

export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15000,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
