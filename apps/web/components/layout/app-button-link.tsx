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
      ? "bg-(--keyColor) text-(--keyColorText) hover:brightness-95"
      : "border border-(--labelDivider) bg-(--systemQuinary) text-(--systemPrimary) hover:bg-(--systemQuaternary)";

  return (
    <Link
      href={href}
      className={`inline-flex rounded-full px-5 py-2.5 text-sm font-bold transition ${variantClass} ${className}`}
    >
      {children}
    </Link>
  );
}
