import { SongCard } from "@/components/song/song-card";
import type { Song } from "@/stores/player.store";
import Link from "next/link";

type SongsApiItem = {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  coverUrl?: string | null;
};

type SongsApiResponse = {
  songs: SongsApiItem[];
  nextCursor: string;
  hasMore: boolean;
};

async function getSongs(): Promise<Song[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBase) return [];

  try {
    const res = await fetch(`${apiBase}/songs?limit=24`, {
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = (await res.json()) as SongsApiResponse;
    return data.songs.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist || "Unknown Artist",
      duration: Number(song.durationSec) || 0,
      coverUrl: song.coverUrl ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function MainPage() {
  const songs = await getSongs();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Bài hát</h1>
        <Link
          href="/main/upload"
          className="inline-flex items-center gap-2 rounded-full bg-green-400 px-4 py-2 text-sm font-semibold text-black hover:bg-green-300 transition-colors"
        >
          Upload
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </div>
  );
}
