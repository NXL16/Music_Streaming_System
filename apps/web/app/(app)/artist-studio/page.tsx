"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";

type Mode = "album" | "playlist";

export default function ArtistStudioPage() {
  const user = useAuthStore((state) => state.user);
  const [mode, setMode] = useState<Mode>("album");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [genre, setGenre] = useState("");
  const [trackIds, setTrackIds] = useState("");
  const [artworkAssetId, setArtworkAssetId] = useState("");
  const [artworkPreview, setArtworkPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canAuthor = [
    "ARTIST",
    "SUPER_ADMIN",
    "ADMIN_USER_OPS",
    "ADMIN_SECURITY_OPS",
  ].includes(user?.role ?? "");

  async function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    setArtworkPreview(URL.createObjectURL(file));
    try {
      const requested = await http.post("/studio/assets/uploads", {
        kind: "IMAGE",
        purpose: "ARTWORK",
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        sizeBytes: file.size,
      });
      const { asset, uploadUrl } = requested.data as {
        asset?: { id?: string };
        uploadUrl?: string;
      };
      if (!asset?.id || !uploadUrl)
        throw new Error("Artwork upload could not be prepared.");
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      await http.post(
        `/studio/assets/${encodeURIComponent(asset.id)}/finalize`,
      );
      setArtworkAssetId(asset.id);
      setMessage("Artwork is ready.");
    } catch {
      setMessage("Could not upload artwork.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!name.trim()) {
      setMessage("Title is required.");
      return;
    }
    setBusy(true);
    const tracks = trackIds
      .split(/[,\n]/)
      .map((id, index) =>
        id.trim()
          ? { songId: id.trim(), position: index + 1, discNumber: 1 }
          : null,
      )
      .filter(Boolean);
    try {
      if (mode === "album")
        await http.post("/studio/catalog/albums/draft", {
          storefront: "vn",
          name: name.trim(),
          artistName: user?.displayName || user?.username || "",
          genreNames: genre ? [genre] : [],
          releaseDate,
          tracks,
          isCompilation: false,
          isComplete: false,
          isPrerelease: false,
          isSingle: false,
          isStudioMastered: false,
          audioTraits: [],
          contentRating: "",
          copyright: "",
          recordLabel: "",
          upc: "",
          url: "",
          artistIds: [],
          offers: [],
          artworkAssetId,
          editorialArtworkAssetId: "",
          editorialVideoAssetId: "",
        });
      else
        await http.post("/studio/catalog/playlists/draft", {
          storefront: "vn",
          name: name.trim(),
          curatorName: user?.displayName || user?.username || "",
          descriptionShort: description,
          descriptionStandard: description,
          tracks,
          isPublic: true,
          playlistType: "USER",
          ownerId: user?.userId || "",
          artistNames: [],
          audioTraits: [],
          url: "",
          editorialPlaylistKind: "",
          hasCollaboration: false,
          isChart: false,
          supportsSing: false,
          artworkAssetId,
          editorialArtworkAssetId: "",
          editorialVideoAssetId: "",
        });
      setMessage("Draft saved successfully.");
    } catch {
      setMessage("Could not save draft. Check the required metadata.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAuthor)
    return (
      <MusicPageLayout>
        <MusicPageHeading title="Artist Studio" />
        <MusicPageSection title="Access">
          <p className="text-(--systemSecondary) [font:var(--body)]">
            Artist Studio is available to artists and administrators.
          </p>
        </MusicPageSection>
      </MusicPageLayout>
    );
  return (
    <MusicPageLayout>
      <MusicPageHeading title="Artist Studio" />
      <MusicPageSection title="Create">
        <div className="mb-6 flex gap-2 border-b border-(--labelDivider) pb-3">
          <button
            type="button"
            onClick={() => setMode("album")}
            className={`rounded-full px-4 py-2 [font:var(--callout-emphasized)] ${mode === "album" ? "bg-(--systemPrimary) text-(--background)" : "text-(--systemSecondary)"}`}
          >
            Album
          </button>
          <button
            type="button"
            onClick={() => setMode("playlist")}
            className={`rounded-full px-4 py-2 [font:var(--callout-emphasized)] ${mode === "playlist" ? "bg-(--systemPrimary) text-(--background)" : "text-(--systemSecondary)"}`}
          >
            Playlist
          </button>
        </div>
        <form
          onSubmit={saveDraft}
          className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]"
        >
          <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-[5px] border border-(--labelDivider) bg-(--systemQuinary)">
            {artworkPreview ? (
              <Image
                src={artworkPreview}
                alt="Artwork preview"
                className="h-full w-full object-cover"
                height={720}
                unoptimized
                width={720}
              />
            ) : (
              <span className="text-center text-(--systemSecondary) [font:var(--callout)]">
                <ImagePlus className="mx-auto mb-2 h-6 w-6" />
                Choose cover
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={uploadArtwork}
            />
          </label>
          <div className="grid gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${mode === "album" ? "Album" : "Playlist"} title`}
              className="border-b border-(--labelDivider) bg-transparent py-3 text-(--systemPrimary) [font:var(--title-2-emphasized)] outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="min-h-20 border-b border-(--labelDivider) bg-transparent py-3 text-(--systemPrimary) [font:var(--body)] outline-none"
            />
            {mode === "album" && (
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="border-b border-(--labelDivider) bg-transparent py-3 text-(--systemPrimary)"
              />
            )}
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Genre"
              className="border-b border-(--labelDivider) bg-transparent py-3 text-(--systemPrimary)"
            />
            <textarea
              value={trackIds}
              onChange={(e) => setTrackIds(e.target.value)}
              placeholder="Track song IDs, one per line"
              className="min-h-28 border-b border-(--labelDivider) bg-transparent py-3 text-(--systemPrimary) [font:var(--callout)] outline-none"
            />
            <button
              disabled={busy}
              className="w-fit rounded-full bg-(--keyColor) px-5 py-2.5 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
            {message && (
              <p className="text-(--systemSecondary) [font:var(--callout)]">
                {message}
              </p>
            )}
          </div>
        </form>
      </MusicPageSection>
    </MusicPageLayout>
  );
}
