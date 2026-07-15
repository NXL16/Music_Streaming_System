"use client";

import Link from "next/link";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { useCatalogSong } from "@/lib/catalog/use-catalog-song";
import { formatDuration } from "@/lib/format/duration";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";
import ResponsiveArtwork from "../media/common/responsive-artwork";

type SongDetailPageProps = {
  songId: string;
};

function SongArtists({
  artists,
  fallbackText,
}: {
  artists?: { id?: string; name: string; url?: string }[];
  fallbackText: string;
}) {
  const formattedArtists = useFormattedArtists({ artists, fallbackText });

  return (
    <span>
      {formattedArtists.map((artist, index) => (
        <span key={`${artist.id}-${index}`}>
          {artist.url ? (
            <Link className="hover:underline" href={artist.url}>
              {artist.name}
            </Link>
          ) : (
            artist.name
          )}
          {index < formattedArtists.length - 1 && ", "}
        </span>
      ))}
    </span>
  );
}

export function SongDetailPage({ songId }: SongDetailPageProps) {
  const { song, loading, error, reload } = useCatalogSong(songId);
  const setQueue = usePlayerStore((state) => state.setQueue);

  if (loading) {
    return <p className="mx-(--bodyGutter) pt-8 text-(--systemSecondary)">Đang tải...</p>;
  }

  if (error) {
    return (
      <div className="mx-(--bodyGutter) pt-8">
        <p className="text-red-500">{error}</p>
        <button className="mt-3 hover:underline" onClick={() => void reload()} type="button">
          Thử lại
        </button>
      </div>
    );
  }

  if (!song) {
    return <p className="mx-(--bodyGutter) pt-8 text-(--systemSecondary)">Không tìm thấy bài hát.</p>;
  }

  return (
    <main className="mx-(--bodyGutter) max-w-4xl pt-8">
      <div className="flex flex-col gap-6 min-[700px]:flex-row min-[700px]:items-end">
        <ResponsiveArtwork
          alt={song.album || song.title}
          className="block size-full rounded-(--global-border-radius-large,10px) object-cover"
          height={316}
          pictureClassName="size-56 shrink-0 overflow-hidden rounded-(--global-border-radius-large,10px) bg-(--genericJoeColor)"
          sizes="224px"
          src="/assets/artwork/1x1.gif"
          srcSet={song.artworkSrcSet}
          width={316}
        />

        <div className="min-w-0 pb-1">
          <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">Song</p>
          <h1 className="mt-1 wrap-break-word text-(--systemPrimary) [font:var(--large-title-emphasized-short)]">
            {song.title}
          </h1>
          <p className="mt-2 text-(--systemSecondary)">
            <SongArtists artists={song.artists} fallbackText={song.artist} />
          </p>
          <p className="mt-1 text-(--systemSecondary)">
            {song.albumUrl ? <Link className="hover:underline" href={song.albumUrl}>{song.album}</Link> : song.album}
            <span className="mx-2">·</span>
            {formatDuration(song.durationSec)}
          </p>
          <button
            className="mt-5 rounded-full bg-(--keyColor,#000) px-5 py-2 text-white [font:var(--body-emphasized)] disabled:opacity-50"
            disabled={!song.playbackUrl}
            onClick={() => setQueue([song])}
            type="button"
          >
            Play
          </button>
        </div>
      </div>
    </main>
  );
}
