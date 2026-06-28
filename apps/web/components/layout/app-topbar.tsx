"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

const mobileNavigationItems = [
  { href: "/home", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
] as const;

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/home")) return "Trang chủ";
  if (pathname.startsWith("/library")) return "Library";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/settings/security")) return "Security";
  if (pathname.startsWith("/settings/account")) return "Account";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/profile")) return "Profile";
  return "Home";
}

function isActiveRoute(pathname: string, href: string) {
  if (href === "/home" || href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppTopbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
    }
  }

  return (
    <header className="hidden sticky top-0 z-30 border-b border-[#343437] bg-[#1f1f20]/90 px-4 py-3 text-white backdrop-blur-2xl sm:px-6 lg:hidden">
      <div className="flex items-center gap-3">
        <Link
          href="/home"
          className="rounded-lg bg-[#fa233b] px-3 py-2 text-sm font-bold text-white"
        >
          Music
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold text-white">
            {getPageTitle(pathname)}
          </p>
          <p className="truncate text-sm font-medium text-white/56">
            {user?.displayName || user?.username || "Your account"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/16"
        >
          Logout
        </button>
      </div>

      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {mobileNavigationItems.map((item) => {
          const active = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                active
                  ? "bg-[#fa233b] text-white"
                  : "bg-white/10 text-white ring-1 ring-white/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
