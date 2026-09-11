import type { MediaCardProps } from "./media-card.types";

type CircleCardMetadataProps = Pick<MediaCardProps, "title">;

export default function CircleCardMetadata({ title }: CircleCardMetadataProps) {
  return (
    <div className="mt-2">
      <div className="[--mc-lineClamp:var(--defaultClampOverride,2)] [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -m-(--mc-overflowBleedSize) p-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize) [--mc-badgeSize:var(--badgeSize,8px)] wrap-break-word line-clamp-(--mc-lineClamp,1) group/underline">
        <span>
          <h3 className="inline text-(--systemPrimary) [font:var(--callout-tall)] line-clamp-2 group-hover/underline:underline">
            {title}
          </h3>
        </span>
      </div>
    </div>
  );
}
