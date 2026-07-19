"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { FavoriteSongButton } from "@/components/songs/favorite-song-button";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";

type Playlist = {
  id: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  trackCount?: number;
};

export default function LibraryPage() {
  const user = useAuthStore((state) => state.user);
  const userId = user?.userId;
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const favorites = useFavoriteStore((state) => state.songs);
  const hydrateFavorites = useFavoriteStore((state) => state.hydrate);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError("");
      const [playlistResponse] = await Promise.all([
        http.get(`/playlists/user/${encodeURIComponent(userId)}`, {
          params: { limit: 50 },
        }),
        hydrateFavorites(),
      ]);
      setPlaylists(
        playlistResponse.data.playlists ??
          playlistResponse.data.data?.playlists ??
          [],
      );
    } catch {
      setError("Could not load your library.");
    }
  }, [hydrateFavorites, userId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function createPlaylist(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await http.post("/playlists", { name: name.trim(), isPublic: false });
      setName("");
      window.dispatchEvent(new Event("library:playlists-changed"));
      await load();
    } catch {
      setError("Could not create playlist.");
    } finally {
      setCreating(false);
    }
  }
  return (
    <MusicPageLayout>
      <MusicPageHeading title="Library" />
      <MusicPageSection id="favourite-songs" title="Favourite songs">
        <div className="border-t border-(--labelDivider)">
          {favorites.map((song) => (
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
                  {song.album ? ` · ${song.album}` : ""}
                </span>
              </Link>
              <span className="shrink-0 text-(--systemSecondary) [font:var(--callout)]">
                {song.durationSec
                  ? `${Math.floor(song.durationSec / 60)}:${String(song.durationSec % 60).padStart(2, "0")}`
                  : ""}
              </span>
              <FavoriteSongButton compact songId={song.id} />
            </div>
          ))}
          {!favorites.length && !error && (
            <p className="py-6 text-(--systemSecondary) [font:var(--callout)]">
              Songs you favourite will appear here.
            </p>
          )}
        </div>
      </MusicPageSection>
      <MusicPageSection id="playlists" title="Playlists">
        <form
          onSubmit={createPlaylist}
          className="mb-5 flex max-w-md gap-2 border-b border-(--labelDivider) pb-3"
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist"
            className="min-w-0 flex-1 bg-transparent text-(--systemPrimary) [font:var(--body-tall)] outline-none"
          />
          <button
            disabled={creating}
            className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-50"
          >
            Create
          </button>
        </form>
        {error && (
          <p className="mb-3 text-(--keyColor) [font:var(--callout)]">
            {error}
          </p>
        )}
        <div className="grid gap-x-5 md:grid-cols-2">
          {playlists.map((playlist) => (
            <Link
              key={playlist.id}
              href={`/playlist/${playlist.id}?library=1`}
              className="border-t border-(--labelDivider) py-5 text-(--systemPrimary)"
            >
              <strong className="[font:var(--body-tall-emphasized)]">
                {playlist.name}
              </strong>
              <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
                {playlist.description || `${playlist.trackCount ?? 0} songs`}
              </span>
            </Link>
          ))}
        </div>
        {!playlists.length && !error && (
          <p className="border-t border-(--labelDivider) py-6 text-(--systemSecondary) [font:var(--callout)]">
            Create a playlist to organize music you love.
          </p>
        )}
      </MusicPageSection>
    </MusicPageLayout>
  );
}
