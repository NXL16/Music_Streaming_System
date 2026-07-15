export function normalizedArtistName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function artistNamesFromText(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/\s*(?:,|&|\b(?:and|feat\.?|ft\.?)\b)\s*/i)
    .map((name) => name.trim())
    .filter((name) => {
      const normalizedName = normalizedArtistName(name);
      if (!normalizedName || seen.has(normalizedName)) return false;
      seen.add(normalizedName);
      return true;
    });
}

export function formatArtistNames(value: string): string {
  return artistNamesFromText(value).join(", ");
}
