"use client";

import type { ReactNode } from "react";
import { AppPlayerBar } from "@/components/layout/app-player-bar";
import AppSidebar from "@/components/layout/app-sidebar";
import { ProtectedOnly } from "@/components/auth/protected-only";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { AppFooter } from "./app-footer";
import { usePathname } from "next/navigation";

type AuthenticatedAppShellProps = {
  children?: ReactNode;
};

export function AuthenticatedAppShell({
  children,
}: AuthenticatedAppShellProps) {
  const drawerOpen = usePlayerStore((state) => state.drawerOpen);
  const pathname = usePathname();

  const hasThemeOverride =
    /^\/playlist\/[^/]+$/.test(pathname) ||
    /^\/album\/[^/]+\/[^/]+$/.test(pathname);

  return (
    <ProtectedOnly>
      <div className="min-h-full">
        <div
          className={`app-container ${hasThemeOverride ? "has-theme-override" : ""} grid gap-0 [grid-template-areas:'structure-header'_'structure-upsell'_'structure-main-section'_'structure-locale-switcher'] grid-cols-[minmax(0,1fr)] grid-rows-[52px_auto_1fr_auto] h-screen min-[484px]:[grid-template-areas:'structure-header_structure-main-section'_'structure-upsell_structure-upsell'_'structure-locale-switcher_structure-locale-switcher'] min-[484px]:grid-cols-[33.88vw_minmax(0,1fr)] min-[484px]:grid-rows-[minmax(0,1fr)_auto_auto] min-[767.32px]:grid-cols-[260px_minmax(0,1fr)] pointer-coarse:max-h-[stretch] ${drawerOpen ? "is-drawer-open" : ""}`}
        >
          <AppSidebar />
          <AppPlayerBar />

          <div
            data-app-scroll-container
            className="flex flex-col [grid-area:structure-main-section] h-auto overflow-x-hidden overflow-y-auto w-full will-change-scroll transition-[margin,width] duration-100 ease-linear z-(--z-default) min-[484px]:mt-0 min-[484px]:ps-(--web-navigation-width) min-[484px]:col-span-full in-[.has-theme-override]:bg-(--joe-color) max-[483px]:in-[.has-theme-override]:-mt-14 max-[483px]:in-[.has-theme-override]:pt-14"
          >
            <main className="grow">
              <div className="mx-auto min-h-full relative w-full z-(--z-default)">
                {children}
              </div>
            </main>

            {pathname !== "/lyrics-sync" && <AppFooter />}
          </div>
        </div>
      </div>
    </ProtectedOnly>
  );
}
