"use client";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [router, status]);

  if (status === "checking" || status === "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7efe5] text-[#23170f]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em]">
          Đang kiểm tra phiên đăng nhập...
        </p>
      </main>
    );
  }

  return children;
}
