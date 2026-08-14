"use client";

import Link from "next/link";
import { Fragment, type MouseEvent } from "react";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";

type ArtistLink = {
  id?: string;
  name: string;
  url?: string;
};

type ArtistLinksProps = {
  artists?: ArtistLink[];
  fallbackText?: string;
  linkClassName?: string;
  textClassName?: string;
  onArtistClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Renders normalized artist credits with consistent separators and links. */
export function ArtistLinks({
  artists,
  fallbackText,
  linkClassName,
  textClassName,
  onArtistClick,
}: ArtistLinksProps) {
  const formattedArtists = useFormattedArtists({ artists, fallbackText });

  return (
    <>
      {formattedArtists.map((artist, index) => (
        <Fragment key={`${artist.id}-${index}`}>
          {artist.url ? (
            <Link
              href={artist.url}
              className={linkClassName}
              onClick={onArtistClick}
            >
              {artist.name}
            </Link>
          ) : (
            <span className={textClassName}>{artist.name}</span>
          )}
          {index < formattedArtists.length - 1 && ", "}
        </Fragment>
      ))}
    </>
  );
}
