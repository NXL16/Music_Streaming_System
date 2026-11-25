"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Loading from "@/app/loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

type AuthRoute = "/login" | "/signup" | "/forgot-password" | "/account";

export const AuthNavigationContext = createContext<
  ((href: AuthRoute, replace?: boolean) => void) | null
>(null);

export function AuthNavigationLink({
  href,
  disabled = false,
  replace = false,
  beforeNavigate,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "onClick" | "onNavigate"> & {
  href: AuthRoute;
  disabled?: boolean;
  beforeNavigate?: () => void;
}) {
  const navigate = useContext(AuthNavigationContext);
  return (
    <Link
      prefetch={true}
      {...props}
      href={href}
      replace={replace}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : props.tabIndex}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      onNavigate={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        beforeNavigate?.();
        if (navigate) {
          event.preventDefault();
          navigate(href, replace);
        }
      }}
    />
  );
}

export function AuthNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const loading = useMinimumLoadingDuration(pending);

  function navigate(href: AuthRoute, replace = false) {
    if (loading) return;
    startTransition(() => (replace ? router.replace(href) : router.push(href)));
  }

  return (
    <AuthNavigationContext value={navigate}>
      <div
        inert={loading}
        aria-hidden={loading || undefined}
        style={loading ? { visibility: "hidden" } : undefined}
      >
        {children}
      </div>
      {loading && (
        <div className="fixed inset-0 z-(--z-web-chrome) bg-(--pageBG) text-(--systemPrimary)">
          <Loading />
        </div>
      )}
    </AuthNavigationContext>
  );
}
