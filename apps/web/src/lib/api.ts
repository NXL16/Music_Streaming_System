import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";

// Tạo một instance (phiên bản) của axios gọi sẵn vào cổng API của bạn
export const api = axios.create({
  baseURL: "http://localhost:9999/api/v1", // Cổng Backend của bạn
  headers: {
    "Content-Type": "application/json",
  },
});

// Trạm kiểm soát: Chặn mọi request TRƯỚC KHI gửi đi
api.interceptors.request.use(
  (config) => {
    // Moi Token từ Zustand Store ra
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
