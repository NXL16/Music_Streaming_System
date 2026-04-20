import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  sub: string;
  username: string;
  email?: string;
  displayName?: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  setAuth: (payload: {
    user: User;
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }) => void;
  setAccessToken: (accessToken: string) => void;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      deviceId: null,
      isAuthenticated: false,

      // Hàm gọi khi User login/signup thành công
      setAuth: ({ user, accessToken, refreshToken, deviceId }) =>
        set({
          user,
          token: accessToken,
          refreshToken,
          deviceId,
          isAuthenticated: true,
        }),

      // Hàm gọi khi chỉ cần cập nhật access token mới
      setAccessToken: (accessToken) => set({ token: accessToken }),

      // Hàm gọi khi refresh token thành công
      setSession: ({ accessToken, refreshToken, deviceId }) =>
        set({
          token: accessToken,
          refreshToken,
          deviceId,
          isAuthenticated: true,
        }),

      // Hàm gọi khi User bấm đăng xuất
      logout: () =>
        set({
          user: null,
          token: null,
          refreshToken: null,
          deviceId: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "musical-auth", // Tên key sẽ lưu trong Application -> Local Storage của trình duyệt
    },
  ),
);
