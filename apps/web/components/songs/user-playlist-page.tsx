"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { http } from "@/lib/api/http";
import type { SongSummary } from "@/lib/songs/song.types";

type UserPlaylist = {
  id: string;
  name: string;
  songs: SongSummary[];
};

export function UserPlaylistPage({ playlistId }: { playlistId: string }) {
  const [playlist, setPlaylist] = useState<UserPlaylist | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await http.get<{ playlist: UserPlaylist }>(
        `/playlists/${encodeURIComponent(playlistId)}`,
      );
      setPlaylist(response.data.playlist);
    } catch {
      setError("Could not load this playlist.");
    }
  }, [playlistId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function removeTrack(songId: string) {
    try {
      await http.delete(
        `/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(songId)}`,
      );
      setPlaylist((current) =>
        current
          ? {
              ...current,
              songs: current.songs.filter((song) => song.id !== songId),
            }
          : current,
      );
    } catch {
      setError("Could not remove this song from the playlist.");
    }
  }

  return (
    <MusicPageLayout>
      <MusicPageHeading title={playlist?.name || "Playlist"} />
      {error && (
        <p className="mb-5 text-(--keyColor) [font:var(--callout)]">{error}</p>
      )}
      <MusicPageSection title="Songs">
        <div className="border-t border-(--labelDivider)">
          {playlist?.songs.map((song) => (
            <div
              key={song.id}
              className="flex items-center gap-3 border-b border-(--labelDivider) py-4"
            >
              <Link
                href={`/song/${song.id}`}
                className="min-w-0 flex-1 text-(--systemPrimary)"
              >
                <strong className="block truncate [font:var(--body-tall-emphasized)]">
                  {song.title}
                </strong>
                <span className="mt-1 block truncate text-(--systemSecondary) [font:var(--callout)]">
                  {song.artist}
                </span>
              </Link>
              <button
                className="shrink-0 text-(--keyColor) [font:var(--callout-emphasized)]"
                onClick={() => void removeTrack(song.id)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          {playlist && !playlist.songs.length && (
            <p className="py-6 text-(--systemSecondary) [font:var(--callout)]">
              No songs in this playlist yet.
            </p>
          )}
        </div>
      </MusicPageSection>
    </MusicPageLayout>
  );
}
