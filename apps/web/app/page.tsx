"use client";

import Link from "next/link";
import { logout } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

export default function Home() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
    }
  }

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7efe5] text-[#23170f]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em]">
          Đang kiểm tra phiên đăng nhập...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
      <section className="mx-auto max-w-4xl rounded-4xl border border-[#ead4bd] bg-white p-8 shadow-[0_24px_80px_rgba(95,55,25,0.12)]">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
          Musical App
        </p>

        <h1 className="mt-4 text-4xl font-black">
          {status === "authenticated"
            ? `Hello, ${user?.displayName}`
            : "You are not logged in"}
        </h1>

        <p className="mt-4 text-[#705846]">
          {status === "authenticated"
            ? "Session đã được khôi phục bằng HttpOnly refresh cookie."
            : "Hãy đăng ký hoặc đăng nhập để bắt đầu."}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {status === "authenticated" ? (
            <button
              onClick={handleLogout}
              className="rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f]"
            >
              Đăng xuất
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f]"
              >
                Đăng nhập
              </Link>

              <Link
                href="/signup"
                className="rounded-2xl border border-[#ead4bd] px-5 py-3 font-bold transition hover:border-[#c45f36]"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
