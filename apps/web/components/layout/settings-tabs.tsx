"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/security", label: "Security" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="mb-6 flex gap-1 border-b border-(--labelDivider)"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2 [font:var(--callout-emphasized)] transition-colors ${
              active
                ? "border-(--keyColor) text-(--systemPrimary)"
                : "border-transparent text-(--systemSecondary) hover:text-(--systemPrimary)"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
