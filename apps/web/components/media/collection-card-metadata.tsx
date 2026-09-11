import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import { ArtistLinks } from "./artist-links";

type CollectionCardMetadataProps = Pick<
  MediaCardProps,
  | "title"
  | "subtitle"
  | "slug"
  | "artists"
  | "resourceType"
  | "contentRating"
  | "isFavorite"
>;

export default function CollectionCardMetadata(
  props: CollectionCardMetadataProps,
) {
  const isExplicit = props.contentRating === "explicit";

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

            {props.isFavorite && (
              <span className="-ms-(--mc-badgeSpacing)">
                <span className="ms-(--favoriteBadgeMarginInlineStart,2px)">
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 64 64"
                    xmlns="http://www.w3.org/2000/svg"
                    className="inline-block align-baseline h-(--favoriteIconSize,9px) w-(--favoriteIconSize,9px)"
                  >
                    <path
                      className="fill-(--favoriteIconStarFill,var(--keyColor))"
                      d="M13.559 60.051c1.102.86 2.5.565 4.166-.645l14.218-10.455L46.19 59.406c1.666 1.21 3.037 1.505 4.166.645 1.102-.833 1.344-2.204.672-4.166l-5.618-16.718 14.353-10.32c1.666-1.183 2.338-2.42 1.908-3.764-.43-1.29-1.693-1.935-3.763-1.908l-17.605.108-5.348-16.8C34.308 4.496 33.34 3.5 31.944 3.5c-1.372 0-2.34.995-2.984 2.984L23.61 23.283l-17.605-.108c-2.07-.027-3.333.618-3.763 1.908-.457 1.344.242 2.58 1.909 3.763l14.352 10.321-5.617 16.718c-.672 1.962-.43 3.333.672 4.166Z"
                    ></path>
                  </svg>
                </span>
              </span>
            )}
          </div>

          {isExplicit && (
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
