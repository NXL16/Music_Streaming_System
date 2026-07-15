"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useCallback, MouseEvent } from "react";

export default function NotFound() {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const rafRef = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const target = e.currentTarget;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      setCoords({ x: clientX - rect.left, y: clientY - rect.top });
    });
  }, []);

  return (
    <main
      className="h-screen w-screen flex flex-col justify-center items-center text-(--systemPrimary) px-4 sm:px-6 overflow-hidden select-none relative"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="hidden lg:block absolute pointer-events-none rounded-full transition-opacity duration-500 blur-[130px] z-0"
        style={{
          width: "360px",
          height: "360px",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.8) 70%)",
          left: `${coords.x - 180}px`,
          top: `${coords.y - 180}px`,
          opacity: isHovered ? 1 : 0,
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full max-w-md sm:max-w-xl lg:max-w-2xl">
        <div className="w-82.5 h-82.5 sm:w-117.5 sm:h-117.5 lg:w-167.5 lg:h-167.5 mb-4 sm:mb-2 flex justify-center items-center pointer-events-none">
          <Image
            src="/Error404.svg"
            alt="404 Error"
            width={670}
            height={670}
            loading="eager"
            className="size-full object-contain"
          />
        </div>

        <h1 className="text-xl sm:text-2xl font-medium tracking-tight mb-2 px-2">
          Trang này không tồn tại
        </h1>

        <p className="text-neutral-400 text-xs sm:text-sm mb-8 font-light px-4 max-w-xs sm:max-w-sm lg:max-w-none lg:whitespace-nowrap">
          Đường dẫn bạn truy cập có thể bị sai hoặc đã được chuyển sang một địa
          chỉ khác.
        </p>

        <Link
          href="/home"
          className="px-5 py-2 sm:px-6 sm:py-2.5 rounded-lg bg-white text-black text-xs sm:text-sm font-medium hover:bg-neutral-200 active:scale-95 transition-all duration-200 shadow-sm"
        >
          Đi tới Trang chủ
        </Link>
      </div>
    </main>
  );
}
