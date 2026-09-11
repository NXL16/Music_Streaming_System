type Router = {
  replace(href: string): void;
};

const ALLOWED_RETURN_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3003",
  "https://music.404hz.me",
  "https://admin.404hz.me",
]);

export function resolveLoginReturnTo() {
  if (typeof window === "undefined") return new URL("/home", "http://localhost:3000");

  const candidate = new URL(
    new URLSearchParams(window.location.search).get("returnTo") ?? "/home",
    window.location.origin,
  );

  return ALLOWED_RETURN_ORIGINS.has(candidate.origin)
    ? candidate
    : new URL("/home", window.location.origin);
}

export function navigateAfterLogin(router: Router) {
  const target = resolveLoginReturnTo();
  if (target.origin === window.location.origin) {
    router.replace(`${target.pathname}${target.search}${target.hash}`);
    return;
  }

  window.location.assign(target.toString());
}
