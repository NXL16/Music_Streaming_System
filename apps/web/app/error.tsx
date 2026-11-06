"use client";

import { useEffect } from "react";
import { RequestErrorState } from "@/components/states/request-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <RequestErrorState onRetry={reset} />
    </main>
  );
}
