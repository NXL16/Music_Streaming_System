import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  username  : string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      // Hàm gọi khi User login thành công
      setAuth: (user, token) => set({ user, token, isAuthenticated: true }),

      // Hàm gọi khi User bấm đăng xuất
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: "musical-auth", // Tên key sẽ lưu trong Application -> Local Storage của trình duyệt
    },
  ),
);
