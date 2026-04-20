import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { env } from "./env";
import { AxiosHeaders } from "axios";
import { AuthRefreshApiResponse } from "@musical/shared-types";

type RetryConfig = {
  _retry?: boolean;
  headers?: Record<string, string>;
};

const baseURL = env.apiUrl?.trim() || "http://localhost:9999/api/v1";

// Tạo một instance (phiên bản) của axios gọi sẵn vào cổng API của bạn
export const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

const refreshClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Trạm kiểm soát: Chặn mọi request TRƯỚC KHI gửi đi
api.interceptors.request.use(
  (config) => {
    // Moi token từ Zustand Store ra
    const token = useAuthStore.getState().token;

    // Nếu có Token thì nhét vào Header Authorization
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as typeof error.config & RetryConfig;
    const status = error.response?.status;
    const url = originalRequest.url ?? "";

    if (
      status !== 401 ||
      originalRequest._retry ||
      url.includes("/auth/login") ||
      url.includes("/auth/signup") ||
      url.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    const { refreshToken, deviceId, setSession, logout } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshResponse = await refreshClient.post<AuthRefreshApiResponse>(
        "/auth/refresh",
        {
          refreshToken,
        },
      );

      const refreshedData = refreshResponse.data?.data;
      const nextAccessToken = refreshedData?.accessToken;
      const nextRefreshToken = refreshedData?.refreshToken;
      const nextDeviceId = refreshedData?.deviceId ?? deviceId;

      if (!nextAccessToken || !nextRefreshToken || !nextDeviceId) {
        logout();
        return Promise.reject(error);
      }

      setSession({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        deviceId: nextDeviceId,
      });

      const headers = AxiosHeaders.from(originalRequest.headers);
      headers.set("Authorization", `Bearer ${nextAccessToken}`);
      originalRequest.headers = headers;

      return api(originalRequest);
    } catch (refreshError) {
      logout();
      return Promise.reject(refreshError);
    }
  },
);
