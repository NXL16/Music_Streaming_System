"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Captions, ImagePlus, ListMusic } from "lucide-react";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";

type ReleaseKind = "album" | "playlist";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-(--labelDivider) bg-(--background) px-3 py-2.5 text-(--systemPrimary) outline-none transition focus:border-(--systemSecondary)";

export default function ArtistStudioPage() {
  const user = useAuthStore((state) => state.user);
  const [releaseKind, setReleaseKind] = useState<ReleaseKind>("album");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [genre, setGenre] = useState("");
  const [trackIds, setTrackIds] = useState("");
  const [artworkAssetId, setArtworkAssetId] = useState("");
  const [artworkPreview, setArtworkPreview] = useState("");
  const artworkPreviewUrlRef = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canAuthor = [
    "ARTIST",
    "SUPER_ADMIN",
    "ADMIN_USER_OPS",
    "ADMIN_SECURITY_OPS",
  ].includes(user?.role ?? "");

  useEffect(() => {
    return () => {
      if (artworkPreviewUrlRef.current) {
        URL.revokeObjectURL(artworkPreviewUrlRef.current);
      }
    };
  }, []);

  async function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    if (artworkPreviewUrlRef.current) {
      URL.revokeObjectURL(artworkPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    artworkPreviewUrlRef.current = previewUrl;
    setArtworkPreview(previewUrl);
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
      if (!asset?.id || !uploadUrl) throw new Error("Upload unavailable");
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      await http.post(
        `/studio/assets/${encodeURIComponent(asset.id)}/finalize`,
      );
      setArtworkAssetId(asset.id);
      setMessage("Đã tải ảnh bìa lên.");
    } catch {
      setMessage("Không thể tải ảnh bìa. Thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!name.trim()) {
      setMessage("Hãy nhập tên phát hành.");
      return;
    }
    setBusy(true);
    const tracks = trackIds
      .split(/[\n,]/)
      .map((id, index) =>
        id.trim()
          ? { songId: id.trim(), position: index + 1, discNumber: 1 }
          : null,
      )
      .filter(Boolean);
    try {
      if (releaseKind === "album") {
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
      } else {
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
      }
      setMessage("Đã lưu bản nháp vào catalog.");
    } catch {
      setMessage("Không thể lưu nháp. Kiểm tra lại thông tin bắt buộc.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAuthor)
    return (
      <MusicPageLayout>
        <section className="mx-auto max-w-xl py-16 text-center">
          <h1 className="text-(--systemPrimary) [font:var(--title-1-emphasized)]">
            Artist Studio
          </h1>
          <p className="mt-3 text-(--systemSecondary)">
            Khu vực này dành cho nghệ sĩ và quản trị viên.
          </p>
        </section>
      </MusicPageLayout>
    );

  return (
    <MusicPageLayout>
      <main className="mx-auto max-w-350 pb-28">
        <header className="flex flex-col gap-5 border-b border-(--labelDivider) pb-6 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between">
          <div>
            <p className="text-sm text-(--systemSecondary)">Artist Studio</p>
            <h1 className="mt-1 text-(--systemPrimary) [font:var(--title-1-emphasized)]">
              Không gian phát hành
            </h1>
            <p className="mt-2 max-w-2xl text-(--systemSecondary)">
              Quản lý catalog và chuẩn bị lyrics đồng bộ trong hai workspace
              tách biệt.
            </p>
          </div>
          <Link
            href="/lyrics-sync"
            className="flex w-fit items-center gap-2 rounded-full bg-(--keyColor) px-4 py-2.5 text-sm text-(--keyColorText) [font:var(--callout-emphasized)]"
          >
            <Captions className="h-4 w-4" />
            Mở Lyrics Sync
          </Link>
        </header>

        <section className="mt-6">
          <div className="mb-5 flex flex-col justify-between gap-3 min-[700px]:flex-row min-[700px]:items-end">
            <div>
              <h2 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">
                Tạo bản nháp
              </h2>
              <p className="mt-1 text-sm text-(--systemSecondary)">
                Điền thông tin cơ bản trước, danh sách bài hát được thêm ở bước
                cuối.
              </p>
            </div>
            <div className="flex rounded-lg border border-(--labelDivider) p-1">
              <button
                type="button"
                onClick={() => setReleaseKind("album")}
                className={`rounded-md px-3 py-1.5 text-sm ${releaseKind === "album" ? "bg-(--systemQuaternary) text-(--systemPrimary)" : "text-(--systemSecondary)"}`}
              >
                Album
              </button>
              <button
                type="button"
                onClick={() => setReleaseKind("playlist")}
                className={`rounded-md px-3 py-1.5 text-sm ${releaseKind === "playlist" ? "bg-(--systemQuaternary) text-(--systemPrimary)" : "text-(--systemSecondary)"}`}
              >
                Playlist
              </button>
            </div>
          </div>
          <form
            onSubmit={saveDraft}
            className="grid gap-5 min-[1000px]:grid-cols-[260px_minmax(0,1fr)_320px]"
          >
            <section className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) p-4">
              <p className="text-sm text-(--systemPrimary) [font:var(--headline)]">
                Ảnh bìa
              </p>
              <label className="mt-4 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-(--labelDivider) bg-(--background)">
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
                  <span className="text-center text-sm text-(--systemSecondary)">
                    <ImagePlus className="mx-auto mb-2 h-6 w-6" />
                    Tải ảnh bìa
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadArtwork}
                />
              </label>
              <p className="mt-3 text-xs leading-5 text-(--systemSecondary)">
                PNG hoặc JPG vuông. Có thể thay đổi ảnh sau khi lưu nháp.
              </p>
            </section>
            <section className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) p-5">
              <p className="text-sm text-(--systemSecondary)">
                Thông tin phát hành
              </p>
              <label className="mt-4 block text-sm text-(--systemSecondary)">
                Tên {releaseKind === "album" ? "album" : "playlist"}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    releaseKind === "album"
                      ? "Ví dụ: Những ngày bình yên"
                      : "Ví dụ: Nhạc cho buổi tối"
                  }
                  className={inputClass}
                />
              </label>
              <label className="mt-4 block text-sm text-(--systemSecondary)">
                Mô tả
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Giới thiệu ngắn về bản phát hành"
                  className={`${inputClass} min-h-28 resize-y`}
                />
              </label>
              <div className="mt-4 grid gap-4 min-[640px]:grid-cols-2">
                <label className="block text-sm text-(--systemSecondary)">
                  Thể loại
                  <input
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                    placeholder="Pop, Hip-hop…"
                    className={inputClass}
                  />
                </label>
                {releaseKind === "album" && (
                  <label className="block text-sm text-(--systemSecondary)">
                    Ngày phát hành
                    <input
                      type="date"
                      value={releaseDate}
                      onChange={(event) => setReleaseDate(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            </section>
            <aside className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) p-5">
              <div className="flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-(--systemSecondary)" />
                <p className="text-sm text-(--systemPrimary) [font:var(--headline)]">
                  Danh sách bài hát
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-(--systemSecondary)">
                Tạm thời nhập mỗi song ID trên một dòng. Bước sau sẽ thay bằng
                picker bài hát.
              </p>
              <textarea
                value={trackIds}
                onChange={(event) => setTrackIds(event.target.value)}
                placeholder="song-id-1\nsong-id-2"
                className={`${inputClass} min-h-48 font-mono text-xs`}
              />
              <button
                disabled={busy}
                className="mt-4 w-full rounded-full bg-(--keyColor) px-4 py-2.5 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-50"
              >
                {busy ? "Đang lưu…" : "Lưu bản nháp"}
              </button>
              {message && (
                <p className="mt-3 text-sm leading-5 text-(--systemSecondary)">
                  {message}
                </p>
              )}
            </aside>
          </form>
        </section>
      </main>
    </MusicPageLayout>
  );
}
