/** Normalizes a catalog title into one stable, URL-safe route segment. */
export function routeSlug(value: string, fallback: string) {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}
