"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import Loading from "@/app/loading";

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
      <main
        className="flex min-h-screen items-center justify-center select-none"
        role="status"
        aria-label="Đang tải"
      >
        <Loading fullScreen={false} inline size={56} />
        <span className="sr-only">Đang tải…</span>
      </main>
    );
  }

  return children;
}
