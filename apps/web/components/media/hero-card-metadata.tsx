import type { MediaCardProps } from "./media-card.types";

type HeroCardMetadataProps = Pick<
  MediaCardProps,
  "title" | "typeTag" | "description" | "subtitle"
>;

export default function HeroCardMetadata({
  title,
  typeTag,
  description,
  subtitle,
}: HeroCardMetadataProps) {
  return (
    <div className="items-end rounded-[inherit] bottom-0 flex inset-e-0 inset-s-0 justify-center absolute pb-0 z-auto [anchor-name:--powerswoosh-chin]">
      <div className="w-full wrap-break-word pt-0 relative [font:var(--callout)] pe-4 ps-4 z-auto">
        <div>
          <p className="text-(--metadata-color-override,var(--systemSecondary-vibrantOnDark)) [font:var(--subhead-emphasized)] mb-0.75 mix-blend-screen min-[0px]:mix-blend-plus-lighter overflow-hidden text-ellipsis whitespace-nowrap">
            {typeTag ?? title}
          </p>
        </div>

        <div className="mb-3.75 max-h-[calc(13px*var(--body-line-height,1.2307692308)*3)] overflow-hidden">
          <p className="me-auto ms-auto text-(--metadata-color-override,var(--systemPrimary-onDark)) [font:var(--body-emphasized)] -translate-y-0.5 line-clamp-2">
            <span className="">{title}</span>
          </p>

          <div className="line-clamp-2 mb-0 text-(--metadata-color-override,var(--systemPrimary-onDark)) [font:var(--subhead)]">
            <p className="-outline-offset-2 [outline-width:2px] pointer-events-auto line-clamp-1">
              <span className="inline-flex">{description ?? subtitle}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
