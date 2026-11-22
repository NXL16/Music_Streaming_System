import { FavoriteBadge } from "@/components/media/common/favorite-badge";
import type { MediaCardProps } from "./media-card.types";

type CircleCardMetadataProps = Pick<MediaCardProps, "title" | "isFavorite">;

export default function CircleCardMetadata({
  title,
  isFavorite,
}: CircleCardMetadataProps) {
  return (
    <div className="mt-2">
      <div className="[--mc-lineClamp:var(--defaultClampOverride,2)] [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -m-(--mc-overflowBleedSize) p-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize) [--mc-badgeSize:var(--badgeSize,8px)] wrap-break-word line-clamp-(--mc-lineClamp,1) group/underline">
        <span className={`${isFavorite ? "pe-(--mc-badgeSpacing)" : ""}`}>
          <h3 className="inline text-(--systemPrimary) [font:var(--callout-tall)] line-clamp-2 group-hover/underline:underline">
            {title}
          </h3>
        </span>

        {isFavorite && (
          <span className="-ms-(--mc-badgeSpacing)">
            <FavoriteBadge />
          </span>
        )}
      </div>
    </div>
  );
}
