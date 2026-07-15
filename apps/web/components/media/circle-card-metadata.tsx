import type { MediaCardProps } from "./media-card.types";

type CircleCardMetadataProps = Pick<MediaCardProps, "title">;

export default function CircleCardMetadata({
  title,
}: CircleCardMetadataProps) {
  return (
    <div className="mt-2">
      <div className="text-center">
        <div className="text-(--systemPrimary) [font:var(--callout)] [--mc-lineClamp:var(--defaultClampOverride,2)] line-clamp-(--mc-lineClamp,2) wrap-break-word overflow-hidden">
          <span>{title}</span>
        </div>
      </div>
    </div>
  );
}
