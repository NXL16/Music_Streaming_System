"use client";

import type { ReactNode } from "react";
import { AppPlayerBar } from "@/components/layout/app-player-bar";
import AppSidebar from "@/components/layout/app-sidebar";
import { ProtectedOnly } from "@/components/auth/protected-only";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { AppFooter } from "./app-footer";

type AuthenticatedAppShellProps = {
  children?: ReactNode;
};

export function AuthenticatedAppShell({
  children,
}: AuthenticatedAppShellProps) {
  const drawerOpen = usePlayerStore((state) => state.drawerOpen);

  return (
    <ProtectedOnly>
      <div className="min-h-full">
        <div
          className={`grid grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-0 h-screen [grid-template-areas:'structure-header_structure-main-section''structure-upsell_structure-upsell''structure-locale-switcher_structure-locale-switcher'] ${drawerOpen ? "is-drawer-open" : ""}`}
        >
          <AppSidebar />

          <AppPlayerBar />

          <div
            data-app-scroll-container
            className="flex flex-col [grid-area:structure-main-section] h-auto overflow-x-hidden overflow-y-auto w-full transition-[margin,width] duration-100 ease-linear z-(--z-default) min-[484px]:mt-0 min-[484px]:ps-(--web-navigation-width) min-[484px]:col-span-full"
          >
            <main className="grow">
              <div className="mx-auto min-h-full relative w-full z-(--z-default)">
                {children}
              </div>
            </main>

            <AppFooter />
          </div>
        </div>
      </div>
    </ProtectedOnly>
  );
}
