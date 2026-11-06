"use client";

import { useEffect } from "react";
import { RequestErrorState } from "@/components/states/request-error-state";

/** Fallback for an unexpected rendering or data-loading failure in App Shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RequestErrorState onRetry={reset} />;
}
