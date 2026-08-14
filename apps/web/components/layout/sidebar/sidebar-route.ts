export function isActiveRoute(pathname: string, href: string) {
  const normalize = (path: string) =>
    path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;

  const normalizedPathname = normalize(pathname);
  const normalizedHref = normalize(href);

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}
