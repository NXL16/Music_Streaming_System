import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import { ArtistLinks } from "./artist-links";

type CollectionCardMetadataProps = Pick<
  MediaCardProps,
  "title" | "subtitle" | "slug" | "artists" | "resourceType" | "contentRating"
>;

export default function CollectionCardMetadata(
  props: CollectionCardMetadataProps,
) {
  const isExplicitAlbum =
    props.resourceType === "albums" && props.contentRating === "explicit";

  return (
    <div className="mt-1">
      <div className="text-start">
        <div className="text-(--systemPrimary) grid [font:var(--callout)] grid-cols-[minmax(0,1fr)_auto]">
          <div className="[--mc-lineClamp:var(--defaultClampOverride,2)] pe-(--mc-overflowBleedSize) relative z-(--z-default) [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -mb-(--mc-overflowBleedSize) -mt-(--mc-overflowBleedSize) -me-(--mc-overflowBleedSize) -ms-(--mc-overflowBleedSize) pb-(--mc-overflowBleedSize) pt-(--mc-overflowBleedSize) ps-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize) line-clamp-(--mc-lineClamp,1) wrap-break-word overflow-hidden [--mc-badgeSize:var(--badgeSize,8px)]">
            <span className="pe-(--mc-badgeSpacing)">
              {props.slug ? (
                <Link href={props.slug} className="hover:underline">
                  {props.title}
                </Link>
              ) : (
                props.title
              )}
            </span>
          </div>

          {isExplicitAlbum && (
            <div className="[--explicitBadgeSize:11px] flex gap-1.25 ms-2.5">
              <span aria-label="Explicit">
                <ExplicitBadgeIcon />
              </span>
            </div>
          )}
        </div>

        <div className="[--overflowBleedSize:0] text-(--systemSecondary) [font:var(--callout)] mt-px">
          <div className="line-clamp-(--mc-lineClamp,1) wrap-break-word overflow-hidden [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -mb-(--mc-overflowBleedSize) -mt-(--mc-overflowBleedSize) -me-(--mc-overflowBleedSize) -ms-(--mc-overflowBleedSize) pb-(--mc-overflowBleedSize) pe-(--mc-overflowBleedSize) pt-(--mc-overflowBleedSize) ps-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize)">
            <ArtistLinks
              artists={props.artists}
              fallbackText={props.subtitle}
              linkClassName="inline text-start hover:underline focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
