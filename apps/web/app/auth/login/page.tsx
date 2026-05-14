"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type LoginForm = {
  username: string;
  password: string;
};

type LoginResponse = {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post<LoginResponse>("/auth/login", data);
      const { accessToken, refreshToken } = res.data.data;

      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);

      router.push("/main");
    } catch (err: unknown) {
      setError("Sai tài khoản hoặc mật khẩu");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-zinc-900 rounded-xl p-8 flex flex-col gap-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">404hz</h1>
          <p className="text-zinc-400 text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Username */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-zinc-300">Tên đăng nhập</label>
            <input
              {...register("username", {
                required: "Username không được để trống",
              })}
              type="text"
              placeholder="username"
              className="bg-zinc-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 placeholder:text-zinc-500"
            />
            {errors.username && (
              <p className="text-red-400 text-xs">{errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-zinc-300">Mật khẩu</label>
            <input
              {...register("password", {
                required: "Mật khẩu không được để trống",
              })}
              type="password"
              placeholder="••••••••"
              className="bg-zinc-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 placeholder:text-zinc-500"
            />
            {errors.password && (
              <p className="text-red-400 text-xs">{errors.password.message}</p>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="bg-green-400 hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-full py-2.5 text-sm transition-colors mt-2"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        {/* Signup link */}
        <p className="text-center text-sm text-zinc-400">
          Chưa có tài khoản?{" "}
          <a href="/auth/signup" className="text-white hover:underline">
            Đăng ký
          </a>
        </p>
      </div>
    </div>
  );
}
