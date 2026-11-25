import type { ReactNode } from "react";
import { AuthNavigation } from "@/components/auth/auth-navigation";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthNavigation>{children}</AuthNavigation>;
}
