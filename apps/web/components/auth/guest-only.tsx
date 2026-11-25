"use client";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Loading from "@/app/loading";

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/home");
    }
  }, [router, status]);

  if (status === "checking" || status === "authenticated") {
    return (
      <main className="bg-(--pageBG) text-(--systemPrimary)">
        <Loading />
      </main>
    );
  }

  return children;
}
