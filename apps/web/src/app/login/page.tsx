"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/useAuthStore";
import { api } from "@/src/lib/api";
import { AxiosError } from "axios";


export default function LoginPage() {
  const [username, setUsername] = useState(""); // 👈 Đổi thành username
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // 👈 Gửi đúng username và password lên API
      const response = await api.post("/auth/login", { username, password });

      const { user, accessToken } = response.data.data;
      setAuth(user, accessToken);
      router.push("/");
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const message =
          (error.response?.data as { message?: string } | undefined)?.message ??
          "Sai tên đăng nhập hoặc mật khẩu!";
        setError(message);
      } else {
        setError("Sai tên đăng nhập hoặc mật khẩu!");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="bg-spotify-black p-8 rounded-xl shadow-2xl w-full max-w-md border border-spotify-elevated">
        <h1 className="text-3xl font-bold text-center mb-8">
          Đăng nhập vào Musical
        </h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-md mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Tên đăng nhập
            </label>
            <input
              type="text" // 👈 Đổi type thành text
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-spotify-elevated border border-transparent focus:border-spotify-green rounded-md p-3 text-white outline-none transition"
              placeholder="Nhập username của bạn"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-spotify-elevated border border-transparent focus:border-spotify-green rounded-md p-3 text-white outline-none transition"
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-spotify-green text-black font-bold py-3 rounded-full mt-4 hover:scale-[1.02] transition disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>

        <p className="text-gray-400 text-sm text-center mt-6">
          Chưa có tài khoản?{" "}
          <span className="text-white hover:underline cursor-pointer">
            Đăng ký ngay
          </span>
        </p>
      </div>
    </div>
  );
}
