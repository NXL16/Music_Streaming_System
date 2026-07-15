import type { MediaCardProps } from "./media-card.types";

type StationCardMetadataProps = Pick<MediaCardProps, "title" | "description">;

export default function StationCardMetadata({
  title,
  description,
}: StationCardMetadataProps) {
  return (
    <div className="mt-1">
      <div className="text-start hover:[--linkHoverTextDecoration:underline]">
        <div className="text-(--systemPrimary) grid [font:var(--callout)] grid-cols-[minmax(0,1fr)_auto] [text-decoration:var(--linkHoverTextDecoration)]">
          <div className="[--mc-lineClamp:var(--defaultClampOverride,2)] pe-(--mc-overflowBleedSize) relative z-(--z-default) [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -mb-(--mc-overflowBleedSize) -mt-(--mc-overflowBleedSize) -me-(--mc-overflowBleedSize) -ms-(--mc-overflowBleedSize) pb-(--mc-overflowBleedSize) pt-(--mc-overflowBleedSize) ps-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize) line-clamp-(--mc-lineClamp,1) wrap-break-word overflow-hidden [--mc-badgeSize:var(--badgeSize,8px)]">
            <span className="pe-(--mc-badgeSpacing)">{title}</span>
          </div>
        </div>

        {description && (
          <div className="[--overflowBleedSize:0] text-(--systemSecondary) [font:var(--callout)] mt-px [text-decoration:var(--linkHoverTextDecoration)]">
            <div className="line-clamp-(--mc-lineClamp,2) wrap-break-word overflow-hidden [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -mb-(--mc-overflowBleedSize) -mt-(--mc-overflowBleedSize) -me-(--mc-overflowBleedSize) -ms-(--mc-overflowBleedSize) pb-(--mc-overflowBleedSize) pe-(--mc-overflowBleedSize) pt-(--mc-overflowBleedSize) ps-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize)">
              <span>{description}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
