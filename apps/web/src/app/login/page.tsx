"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/useAuthStore";
import { api } from "@/src/lib/api";
import { AxiosError } from "axios";
import { ApiEnvelope, AuthSessionData } from "@musical/shared-types";

const readErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as ApiEnvelope<unknown> | undefined)?.message;
    if (Array.isArray(message) && message.length > 0) {
      return message[0] || fallback;
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
      const payload =
        mode === "login"
          ? { username, password }
          : { username, email, displayName, password };

      const response = await api.post<ApiEnvelope<AuthSessionData>>(endpoint, payload);

      const data = response.data.data;
      const user = data?.user;
      const accessToken = data?.accessToken;
      const nextRefreshToken = data?.refreshToken;
      const deviceId = data?.deviceId;

      if (
        !user?.sub ||
        !user.username ||
        !user.role ||
        !accessToken ||
        !nextRefreshToken ||
        !deviceId
      ) {
        setError("Phản hồi đăng nhập chưa đầy đủ dữ liệu phiên.");
        return;
      }

      setAuth({
        user: {
          sub: user.sub,
          username: user.username,
          role: user.role,
          email: user.email,
          displayName: user.displayName,
        },
        accessToken,
        refreshToken: nextRefreshToken,
        deviceId,
      });

      setSuccess(mode === "login" ? "Đăng nhập thành công." : "Đăng ký thành công.");
      router.push("/");
    } catch (error: unknown) {
      const fallback =
        mode === "login"
          ? "Sai tên đăng nhập hoặc mật khẩu."
          : "Đăng ký thất bại. Vui lòng kiểm tra dữ liệu.";
      setError(readErrorMessage(error, fallback));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-4">
      <div className="bg-spotify-black p-8 rounded-xl shadow-2xl w-full max-w-md border border-spotify-elevated">
        <h1 className="text-3xl font-bold text-center mb-4">Xác thực Musical</h1>

        <div className="grid grid-cols-2 gap-2 bg-spotify-base rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-white text-black"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-white text-black"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Đăng ký
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-md mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500 text-emerald-400 p-3 rounded-md mb-6 text-sm text-center">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-spotify-elevated border border-transparent focus:border-spotify-green rounded-md p-3 text-white outline-none transition"
              placeholder="Nhập username của bạn"
              required
            />
          </div>

          {mode === "signup" && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-spotify-elevated border border-transparent focus:border-spotify-green rounded-md p-3 text-white outline-none transition"
                  placeholder="name@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Tên hiển thị</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-spotify-elevated border border-transparent focus:border-spotify-green rounded-md p-3 text-white outline-none transition"
                  placeholder="Tên hiển thị"
                  required
                />
              </div>
            </>
          )}

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
            {isLoading
              ? "Đang xử lý..."
              : mode === "login"
                ? "Đăng nhập"
                : "Đăng ký"}
          </button>
        </form>
      </div>
    </div>
  );
}
