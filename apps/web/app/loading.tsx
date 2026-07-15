import Image from "next/image";

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
  const loaderSize = size ?? 56;

  return (
    <div
      className={
        fullScreen
          ? "h-screen w-screen flex items-center justify-center select-none"
          : inline
            ? "inline-flex items-center justify-center select-none"
          : "flex items-center justify-center py-4 select-none"
      }
      role="status"
      aria-label="Đang tải"
    >
      <Image
        alt=""
        aria-hidden="true"
        height={loaderSize}
        src="/Loading.svg?v=20260715"
        style={{ filter: "invert(1)" }}
        unoptimized
        width={loaderSize}
      />
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
