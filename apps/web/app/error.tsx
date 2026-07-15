"use client";

import { useEffect } from "react";

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
    <main className="h-screen w-screen flex flex-col justify-center items-center text-(--systemPrimary) px-4 sm:px-6 overflow-hidden select-none text-center">
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md">
        <h1 className="text-xl sm:text-2xl font-medium tracking-tight mb-2 px-2">
          Đã có lỗi xảy ra
        </h1>

        <p className="text-neutral-400 text-xs sm:text-sm mb-8 font-light px-4 max-w-xs sm:max-w-sm">
          Rất tiếc, đã có sự cố khi tải nội dung. Vui lòng thử lại.
        </p>

        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 sm:px-6 sm:py-2.5 rounded-lg bg-white text-black text-xs sm:text-sm font-medium hover:bg-neutral-200 active:scale-95 transition-all duration-200 shadow-sm"
        >
          Thử lại
        </button>
      </div>
    </main>
  );
}
