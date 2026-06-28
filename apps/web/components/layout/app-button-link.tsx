import Link from "next/link";
import type { ReactNode } from "react";

type AppButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

export function AppButtonLink({
  href,
  children,
  variant = "secondary",
  className = "",
}: AppButtonLinkProps) {
  const variantClass =
    variant === "primary"
      ? "bg-[#fa233b] text-white hover:bg-[#d91d32]"
      : "bg-[#f2f2f7] text-[#1d1d1f] hover:bg-[#e5e5ea]";

  return (
    <Link
      href={href}
      className={`inline-flex rounded-full px-5 py-2.5 text-sm font-bold transition ${variantClass} ${className}`}
    >
      {children}
    </Link>
  );
}
