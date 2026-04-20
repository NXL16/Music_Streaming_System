"use client";

import { useAuthStore } from "@/src/store/useAuthStore";
import { api } from "@/src/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Dù backend lỗi, vẫn xóa phiên local để tránh giữ token hỏng.
    } finally {
      logout();
      router.push("/login");
    }
  };

  return (
    <header className="h-16 bg-spotify-base/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-6 rounded-t-lg">
      <div className="flex gap-2">
        <button className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-gray-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <button className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-gray-400 hover:text-white">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            {/* 👈 Hiển thị username thay vì email */}
            <span className="text-sm font-semibold">{user?.username}</span>
            <button className="w-8 h-8 bg-spotify-elevated rounded-full flex items-center justify-center hover:scale-105 transition">
              <UserIcon size={16} />
            </button>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white ml-2"
              title="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <>
            <Link
              href="/login"
              className="text-gray-400 hover:text-white font-semibold text-sm hover:scale-105 transition"
            >
              Đăng ký
            </Link>
            <Link href="/login">
              <button className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm hover:scale-105 transition">
                Đăng nhập
              </button>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
