"use client";

import type { ReactNode } from "react";
import { AppPlayerBar } from "@/components/layout/app-player-bar";
import AppSidebar from "@/components/layout/app-sidebar";
import { ProtectedOnly } from "@/components/auth/protected-only";

type AuthenticatedAppShellProps = {
  children?: ReactNode;
};

export function AuthenticatedAppShell({
  children,
}: AuthenticatedAppShellProps) {
  return (
    <ProtectedOnly>
      <div className="min-h-full">
        <div className="grid grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-0 h-screen [grid-template-areas:'structure-header_structure-main-section''structure-upsell_structure-upsell''structure-locale-switcher_structure-locale-switcher']">
          <AppSidebar />

          <AppPlayerBar />

          <div
            data-app-scroll-container
            className="flex flex-col [grid-area:structure-main-section] h-auto overflow-x-hidden overflow-y-auto w-full transition-[margin,width] duration-100 ease-linear z-(--z-default) min-[484px]:mt-0 min-[484px]:ps-(--web-navigation-width) min-[484px]:col-span-full"
          >
            <main className="grow">
              <div className="mx-auto max-w-420 min-h-full relative w-full z-(--z-default) min-[484px]:max-w-none">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ProtectedOnly>
  );
}
