"use client";

import type { ReactNode } from "react";
import { AuthenticatedAppShell } from "@/components/layout/authenticated-app-shell";

type ProtectedPageShellProps = {
  children?: ReactNode;
};

export function ProtectedPageShell({ children }: ProtectedPageShellProps) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
