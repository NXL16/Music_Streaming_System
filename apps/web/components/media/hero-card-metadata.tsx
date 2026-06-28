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
    <div className="flex items-end justify-center rounded-[inherit] bottom-0 inset-s-0 inset-e-0 pb-0 absolute z-auto [anchor-name:--powerswoosh-chin]">
      <div className="w-full pt-0 relative wrap-break-word [font:var(--callout)] ps-4 pe-4 z-auto">
        <div>
          <p className="text-(--metadata-color-override,var(--systemSecondary-vibrantOnDark)) [font:var(--subhead-emphasized)] mb-0.75 mix-blend-screen min-[0px]:mix-blend-plus-lighter overflow-hidden text-ellipsis whitespace-nowrap">
            {typeTag ?? title}
          </p>
        </div>
        <div className="mb-3.75 max-h-[calc(13px*var(--body-line-height,1.2307692308)*3)]">
          <div className="text-(--metadata-color-override,var(--systemPrimary-onDark)) [font:var(--subhead)] mb-0 line-clamp-3">
            <p>
              <span>{description ?? subtitle}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
