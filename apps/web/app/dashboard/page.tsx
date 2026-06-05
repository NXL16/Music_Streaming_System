"use client";

import Link from "next/link";
import { ProtectedOnly } from "@/components/auth/protected-only";
import { useAuthStore } from "@/lib/auth/auth-store";

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <ProtectedOnly>
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto max-w-4xl rounded-4xl border border-[#ead4bd] bg-white p-8 shadow-[0_24px_80px_rgba(95,55,25,0.12)]">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
            Dashboard
          </p>

          <h1 className="mt-4 text-4xl font-black">
            Hello, {user?.displayName}
          </h1>

          <p className="mt-4 text-[#705846]">
            Trang này chỉ user đã đăng nhập mới xem được.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="inline-flex rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f]"
            >
              Xem hồ sơ
            </Link>

            <Link
              href="/"
              className="inline-flex rounded-2xl border border-[#ead4bd] px-5 py-3 font-bold transition hover:border-[#c45f36]"
            >
              Về trang chủ
            </Link>
          </div>
        </section>
      </main>
    </ProtectedOnly>
  );
}
