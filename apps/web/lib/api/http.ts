import axios, { type InternalAxiosRequestConfig } from "axios";
import { getAccessToken } from "@/lib/auth/access-token-store";
import { refreshAccessToken } from "@/lib/auth/session-refresh";
import {
  getReadRetryDelay,
  type RetryAbortSignal,
  shouldRetryReadRequest,
  waitForReadRetry,
} from "./http-retry";

export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 16000,
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
  _readRetryCount?: number;
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
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      canRefreshRequest(originalRequest)
    ) {
      originalRequest._retry = true;

      try {
        const session = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${session.accessToken}`;
        return http.request(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    const retryCount = originalRequest._readRetryCount ?? 0;
    if (!shouldRetryReadRequest(error, retryCount))
      return Promise.reject(error);

    originalRequest._readRetryCount = retryCount + 1;
    const shouldContinue = await waitForReadRetry(
      getReadRetryDelay(retryCount),
      originalRequest.signal as RetryAbortSignal | undefined,
    );
    return shouldContinue
      ? http.request(originalRequest)
      : Promise.reject(error);
  },
);
