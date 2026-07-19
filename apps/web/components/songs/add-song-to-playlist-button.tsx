"use client";

import { useState } from "react";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";

type Playlist = { id: string; name: string };

export function AddSongToPlaylistButton({ songId }: { songId: string }) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [message, setMessage] = useState("");

  async function openPicker() {
    if (!user?.userId) return;
    setOpen(true);
    setMessage("");
    try {
      const response = await http.get(
        `/playlists/user/${encodeURIComponent(user.userId)}`,
        { params: { limit: 50 } },
      );
      setPlaylists(response.data.playlists ?? []);
    } catch {
      setMessage("Could not load your playlists.");
    }
  }

  async function addToPlaylist(playlistId: string) {
    try {
      await http.post(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        songId,
      });
      setMessage("Added to playlist.");
    } catch {
      setMessage("Could not add this song to the playlist.");
    }
  }

  return (
    <div className="relative">
      <button
        className="rounded-full bg-(--systemQuaternary) px-4 py-2 text-(--systemPrimary) [font:var(--body-emphasized)]"
        onClick={() => void openPicker()}
        type="button"
      >
        Add to Playlist
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-64 border border-(--labelDivider) bg-(--pageBG) p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <strong className="[font:var(--callout-emphasized)]">
              Your playlists
            </strong>
            <button
              className="text-(--systemSecondary)"
              onClick={() => setOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="block w-full rounded px-2 py-2 text-left text-(--systemPrimary) hover:bg-(--systemQuaternary) [font:var(--callout)]"
              onClick={() => void addToPlaylist(playlist.id)}
              type="button"
            >
              {playlist.name}
            </button>
          ))}
          {!playlists.length && !message && (
            <p className="px-2 py-3 text-(--systemSecondary) [font:var(--callout)]">
              Create a playlist in Library first.
            </p>
          )}
          {message && (
            <p className="px-2 py-2 text-(--systemSecondary) [font:var(--callout)]">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
