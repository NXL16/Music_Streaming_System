type ReleaseDateStyle = "long" | "short";

const releaseDateFormatters: Record<ReleaseDateStyle, Intl.DateTimeFormat> = {
  long: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  short: new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }),
};

/** Formats the date-only values returned by catalog resources in UTC. */
export function formatReleaseDate(
  dateValue?: string,
  style: ReleaseDateStyle = "long",
) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : releaseDateFormatters[style].format(date);
}

/** Returns a release year while preserving malformed catalog values as-is. */
export function formatReleaseYear(dateValue?: string) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? dateValue.slice(0, 4)
    : String(date.getUTCFullYear());
}
