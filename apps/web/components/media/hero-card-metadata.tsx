import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import type { MediaCardProps } from "./media-card.types";

type HeroCardMetadataProps = Pick<
  MediaCardProps,
  | "title"
  | "typeTag"
  | "showTypeTag"
  | "showTitle"
  | "hideHeroDescription"
  | "resourceType"
  | "description"
  | "subtitle"
  | "contentRating"
>;

export default function HeroCardMetadata({
  title,
  typeTag,
  showTypeTag = true,
  showTitle = true,
  hideHeroDescription = false,
  resourceType,
  description,
  subtitle,
  contentRating,
}: HeroCardMetadataProps) {
  const isStation = resourceType === "stations";

  return (
    <div className="items-end rounded-[inherit] bottom-0 flex inset-e-0 inset-s-0 justify-center absolute pb-0 z-4 [anchor-name:--powerswoosh-chin] pointer-events-none">
      <div className="w-full wrap-break-word pt-0 relative [font:var(--callout)] pe-4 ps-4 z-auto">
        {showTypeTag && typeTag && (
          <div>
            <p className="text-(--metadata-color-override,var(--systemSecondary-vibrantOnDark)) [font:var(--subhead-emphasized)] mb-0.75 mix-blend-plus-lighter overflow-hidden text-ellipsis whitespace-nowrap">
              {typeTag}
            </p>
          </div>
        )}

        <div className="mb-3.75 max-h-[calc(13px*var(--body-line-height,1.2307692308)*3)] overflow-hidden">
          {showTitle && (
            <p className="me-auto ms-auto text-(--metadata-color-override,var(--systemPrimary-onDark)) [font:var(--body-emphasized)] -translate-y-0.5 line-clamp-2">
              <span className="">{title}</span>

              {contentRating && (
                <span className="inline-grid -inset-e-2.5 ms-1 sticky transform-[translateY(-0.8px)] align-middle z-(--z-default) [--explicitBadgeSize:11px]">
                  <ExplicitBadgeIcon />
                </span>
              )}
            </p>
          )}

          {!hideHeroDescription && (
            <div className="line-clamp-2 mb-0 text-(--metadata-color-override,var(--systemPrimary-onDark)) [font:var(--subhead)]">
              <p
                className={`-outline-offset-2 [outline-width:2px] ${
                  isStation ? "pointer-events-none" : "[pointer-events:all]"
                } line-clamp-1`}
              >
                <span className="inline-flex">{description ?? subtitle}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
