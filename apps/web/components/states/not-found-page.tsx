"use client";

import Loading from "@/app/loading";
import { AuthenticatedAppShell } from "@/components/layout/authenticated-app-shell";
import { useAuthStore } from "@/lib/auth/auth-store";
import { NotFoundState } from "./not-found-state";
import { PublicNotFoundState } from "./public-not-found-state";

/** Select the 404 presentation from the current authentication state. */
export function NotFoundPage() {
  const status = useAuthStore((state) => state.status);

  if (status === "checking") return <Loading fullScreen />;
  if (status !== "authenticated") return <PublicNotFoundState />;

  return (
    <AuthenticatedAppShell>
      <NotFoundState />
    </AuthenticatedAppShell>
  );
}
