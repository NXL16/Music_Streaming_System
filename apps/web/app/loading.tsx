import { Spinner } from "@/components/loading/spinner";
import type { CSSProperties } from "react";

type LoadingProps = {
  fullScreen?: boolean;
  inline?: boolean;
  size?: number;
};

export default function Loading({
  fullScreen = true,
  inline = false,
  size,
}: LoadingProps) {
  const containerClassName = fullScreen
    ? "h-screen w-screen flex items-center justify-center select-none"
    : inline
      ? "inline-flex items-center justify-center select-none"
      : "flex items-center justify-center py-4 select-none";

  return (
    <div
      className={containerClassName}
      role="status"
      aria-label="Loading"
      style={
        size === undefined
          ? undefined
          : ({ "--loading-spinner-size": `${size}px` } as CSSProperties)
      }
    >
      <Spinner className="app-loading-spinner" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
