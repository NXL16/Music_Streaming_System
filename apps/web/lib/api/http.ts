import axios, { type InternalAxiosRequestConfig } from "axios";
import { getAccessToken } from "@/lib/auth/access-token-store";
import { refreshAccessToken } from "@/lib/auth/session-refresh";

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

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const PUBLIC_AUTH_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/auth/google/login",
  "/auth/2fa/login",
  "/auth/refresh",
  "/auth/password/",
];

function canRefreshRequest(config: RetryableRequestConfig) {
  const url = config.url ?? "";
  return !PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as
      | RetryableRequestConfig
      | undefined;

    if (
      !originalRequest ||
      originalRequest._retry ||
      !canRefreshRequest(originalRequest)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const session = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${session.accessToken}`;
      return http.request(originalRequest);
    } catch {
      return Promise.reject(error);
    }
  },
);
