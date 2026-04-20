import { Home, Search, Library } from "lucide-react";
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-spotify-black p-4 flex flex-col gap-4 hidden md:flex">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mb-4">
        <div className="w-8 h-8 bg-spotify-green rounded-full flex items-center justify-center font-bold text-black">
          M
        </div>
        <span className="text-xl font-bold">Musical</span>
      </div>

      {/* Navigation */}
      <nav className="bg-spotify-base rounded-lg p-4 flex flex-col gap-4">
        <Link
          href="/"
          className="flex items-center gap-4 text-gray-400 hover:text-white transition font-semibold"
        >
          <Home size={24} /> Trang chủ
        </Link>
        <Link
          href="/search"
          className="flex items-center gap-4 text-gray-400 hover:text-white transition font-semibold"
        >
          <Search size={24} /> Tìm kiếm
        </Link>
      </nav>

      {/* Library */}
      <div className="bg-spotify-base rounded-lg p-4 flex-1">
        <div className="flex items-center gap-4 text-gray-400 hover:text-white transition font-semibold mb-4 cursor-pointer">
          <Library size={24} /> Thư viện của bạn
        </div>
        <div className="text-sm text-gray-400 mt-4">Chưa có playlist nào.</div>
      </div>
    </aside>
  );
}
