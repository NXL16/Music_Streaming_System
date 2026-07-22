"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import Loading from "@/app/loading";

export function ProtectedOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const showLoading = useMinimumLoadingDuration(
    status === "checking" || status === "guest",
  );

  useEffect(() => {
    if (status === "guest") {
      router.replace("/login");
    }
  }, [router, status]);

  if (showLoading) {
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
