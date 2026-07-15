import type { MediaCardProps } from "./media-card.types";

type SocialCardMetadataProps = Pick<
  MediaCardProps,
  "title" | "subtitle" | "description" | "typeTag"
>;

export default function SocialCardMetadata({
  title,
  subtitle,
  description,
  typeTag,
}: SocialCardMetadataProps) {
  return (
    <div className="flex-1 min-w-0 py-1">
      {typeTag && (
        <div className="text-(--systemTertiary) [font:var(--caption-2-emphasized)] uppercase tracking-wide mb-1 line-clamp-1">
          {typeTag}
        </div>
      )}

      <div className="text-(--systemPrimary) [font:var(--callout-emphasized)] line-clamp-1 wrap-break-word">
        {title}
      </div>

      {subtitle && (
        <div className="text-(--systemSecondary) [font:var(--caption-1)] mt-0.5 line-clamp-1 wrap-break-word">
          {subtitle}
        </div>
      )}

      {description && (
        <div className="text-(--systemTertiary) [font:var(--caption-1)] mt-1.5 line-clamp-3 wrap-break-word">
          {description}
        </div>
      )}
    </div>
  );
}
