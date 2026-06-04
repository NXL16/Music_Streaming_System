"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";

export function ProtectedOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "guest") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "checking" || status === "guest") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7efe5] text-[#23170f]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em]">
          Đang kiểm tra quyền truy cập...
        </p>
      </main>
    );
  }

  return children;
}
