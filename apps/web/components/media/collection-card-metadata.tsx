import Link from "next/link";
import { Fragment } from "react";
import type { MediaCardProps } from "./media-card.types";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";

type CollectionCardMetadataProps = Pick<
  MediaCardProps,
  "title" | "subtitle" | "slug" | "artists"
>;

export default function CollectionCardMetadata(
  props: CollectionCardMetadataProps,
) {
  const artists = useFormattedArtists({
    artists: props.artists,
    fallbackText: props.subtitle,
  });

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
        </div>

        <div className="[--overflowBleedSize:0] text-(--systemSecondary) [font:var(--callout)] mt-px">
          <div className="line-clamp-(--mc-lineClamp,1) wrap-break-word overflow-hidden [--mc-overflowBleedSize:var(--overflowBleedSize,4px)] [--mc-badgeSpacing:calc(var(--mc-badgeSize)+var(--mc-overflowBleedSize))] [clip-path:inset(var(--mc-overflowBleedSize))] -mb-(--mc-overflowBleedSize) -mt-(--mc-overflowBleedSize) -me-(--mc-overflowBleedSize) -ms-(--mc-overflowBleedSize) pb-(--mc-overflowBleedSize) pe-(--mc-overflowBleedSize) pt-(--mc-overflowBleedSize) ps-(--mc-overflowBleedSize) scroll-p-(--mc-overflowBleedSize)">
            <span>
              {artists.map((artist, index) => (
                <Fragment key={`${artist.id}-${index}`}>
                  {artist.url ? (
                    <Link
                      href={artist.url}
                      className="inline text-start hover:underline focus:outline-none"
                    >
                      <span>{artist.name}</span>
                    </Link>
                  ) : (
                    <span>{artist.name}</span>
                  )}

                  {index < artists.length - 1 && ", "}
                </Fragment>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
