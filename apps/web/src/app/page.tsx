"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Music2 } from "lucide-react";
import { Song, usePlayerStore } from "../store/usePlayerStore";
import { api } from "../lib/api";
import { AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { ApiEnvelope } from "@musical/shared-types";

type SongListData = {
  songs: Song[];
};

type SongUploadData = {
  _id: string;
  title: string;
};

const readErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as ApiEnvelope<unknown> | undefined)
      ?.message;
    if (Array.isArray(message) && message.length > 0) {
      return message[0] || fallback;
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const sectionClass = "bg-spotify-highlight rounded-xl border border-spotify-elevated p-5";

export default function HomePage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsError, setSongsError] = useState("");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");

  const [activeSongId, setActiveSongId] = useState("");
  const [songDetail, setSongDetail] = useState<Song | null>(null);
  const [songDetailError, setSongDetailError] = useState("");

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadPublic, setUploadPublic] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState("");
  const [uploading, setUploading] = useState(false);

  const playSong = usePlayerStore((state) => state.playSong);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const fetchSongs = async (params?: { search?: string; genre?: string }) => {
    try {
      setSongsError("");

      const query = new URLSearchParams();
      if (params?.search?.trim()) {
        query.set("search", params.search.trim());
      }
      if (params?.genre?.trim()) {
        query.set("genre", params.genre.trim());
      }

      const endpoint = query.toString() ? `/songs?${query.toString()}` : "/songs";
      const response = await api.get<ApiEnvelope<SongListData>>(endpoint);
      setSongs(response.data.data?.songs ?? []);
    } catch (error: unknown) {
      setSongsError(readErrorMessage(error, "Không thể tải danh sách bài hát."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSongs();
  }, []);

  const handleSongFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetchSongs({ search, genre });
  };

  const handleLoadSongDetail = async (sourceId: string) => {
    const id = sourceId.trim();
    if (!id) {
      return;
    }

    try {
      setSongDetailError("");
      setActiveSongId(id);
      const response = await api.get<ApiEnvelope<Song>>(`/songs/${id}`);
      setSongDetail(response.data.data ?? null);
    } catch (error: unknown) {
      setSongDetailError(readErrorMessage(error, "Không thể lấy chi tiết bài hát."));
    }
  };

  const handleUploadSong = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadTitle.trim()) {
      setUploadResult("Vui lòng nhập tiêu đề bài hát.");
      return;
    }
    if (!uploadFile) {
      setUploadResult("Vui lòng chọn file audio để upload.");
      return;
    }

    try {
      setUploading(true);
      setUploadResult("");

      const formData = new FormData();
      formData.append("title", uploadTitle.trim());
      formData.append("isPublic", String(uploadPublic));
      formData.append("file", uploadFile);

      const response = await api.post<ApiEnvelope<SongUploadData>>(
        "/songs/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setUploadResult(
        response.data.message && typeof response.data.message === "string"
          ? response.data.message
          : "Upload thành công.",
      );

      setUploadFile(null);
      setUploadTitle("");
      setUploadPublic(false);
      await fetchSongs({ search, genre });
    } catch (error: unknown) {
      setUploadResult(readErrorMessage(error, "Upload thất bại."));
    } finally {
      setUploading(false);
    }
  };

  const handleSelectSong = async (song: Song) => {
    playSong(song);
    await handleLoadSongDetail(song._id);
  };

  const featuredSong = songs[0] ?? null;
  const latestSongs = songs.slice(0, 6);

  if (loading) {
    return (
      <div className="text-gray-400 font-semibold">
        Đang tải danh sách bài hát...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={sectionClass}>
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <div className="bg-gradient-to-br from-spotify-green/25 via-spotify-base to-spotify-base rounded-xl p-5 border border-spotify-elevated">
            <p className="text-xs uppercase tracking-wider text-gray-300 mb-2">Spotify-style experience</p>
            <h1 className="text-3xl font-bold">Musical</h1>
            <p className="text-gray-300 mt-2 max-w-xl">
              Một nơi để nghe nhạc, khám phá bài hát mới và tải nhạc của bạn lên hệ thống.
            </p>

            {featuredSong ? (
              <div className="mt-4 flex items-center justify-between gap-3 bg-spotify-base/70 rounded-lg p-3">
                <div>
                  <p className="text-xs text-gray-400">Đề xuất hôm nay</p>
                  <p className="font-semibold truncate max-w-[340px]">{featuredSong.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSelectSong(featuredSong)}
                  className="bg-spotify-green text-black rounded-full h-10 w-10 flex items-center justify-center"
                >
                  <Play fill="currentColor" size={16} className="ml-0.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-4">Chưa có bài hát nào để đề xuất.</p>
            )}
          </div>

          <div className="bg-spotify-base rounded-xl p-4 border border-spotify-elevated text-sm">
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <Music2 size={16} /> Phiên hiện tại
            </div>
            <p>Tài khoản: <span className="font-semibold">{user?.username ?? "Khách"}</span></p>
            <p className="mt-1">Vai trò: <span className="font-semibold">{user?.role ?? "guest"}</span></p>
            <p className="mt-1">Kho nhạc hiện có: <span className="font-semibold">{songs.length}</span> bài</p>
            <div className="mt-4 pt-3 border-t border-spotify-elevated">
              <p className="text-xs text-gray-400">Trạng thái phát</p>
              <p className="font-semibold mt-1">
                {currentSong ? `${currentSong.title} ${isPlaying ? "(đang phát)" : "(đang tạm dừng)"}` : "Chưa chọn bài hát"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Danh sách bài hát</h2>
          <span className="text-xs text-gray-400">GET /songs</span>
        </div>

        <form onSubmit={handleSongFilter} className="grid md:grid-cols-4 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-spotify-base rounded-lg px-3 py-2 outline-none border border-transparent focus:border-spotify-green"
            placeholder="Tìm theo tên bài hát"
          />
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-spotify-base rounded-lg px-3 py-2 outline-none border border-transparent focus:border-spotify-green"
            placeholder="Lọc theo thể loại"
          />
          <button
            type="submit"
            className="bg-white text-black rounded-lg px-3 py-2 font-semibold"
          >
            Lọc danh sách
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setGenre("");
              setLoading(true);
              void fetchSongs();
            }}
            className="border border-spotify-elevated rounded-lg px-3 py-2"
          >
            Tải lại
          </button>
        </form>

        {songsError && <p className="text-red-400 text-sm mt-3">{songsError}</p>}

        {songs.length === 0 ? <div className="text-gray-400 mt-3">Chưa có bài hát nào trên hệ thống.</div> : null}

        {latestSongs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Nghe gần đây</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {latestSongs.map((song) => (
                <button
                  key={`latest-${song._id}`}
                  type="button"
                  onClick={() => void handleSelectSong(song)}
                  className="text-left bg-spotify-base hover:bg-spotify-elevated rounded-lg p-3 flex items-center justify-between"
                >
                  <span className="truncate pr-3">{song.title}</span>
                  <Play size={14} className="text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 mt-4">
          {songs.map((song) => (
            <div
              key={song._id}
              className="bg-spotify-base p-3 rounded-lg cursor-pointer hover:bg-spotify-elevated transition group relative border border-transparent hover:border-spotify-press"
              onClick={() => void handleSelectSong(song)}
            >
              <div className="relative mb-3 pb-[100%] rounded-md shadow-lg overflow-hidden bg-gray-800">
                {song.thumbnails?.large && (
                  <img
                    src={song.thumbnails.large}
                    alt={song.title}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                )}

                <button className="absolute bottom-2 right-2 w-10 h-10 bg-spotify-green text-black rounded-full flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-xl hover:scale-105 z-10">
                  <Play fill="currentColor" size={18} className="ml-1" />
                </button>
              </div>

              <h3 className="font-bold text-white truncate">{song.title}</h3>
              <p className="text-xs text-gray-400 truncate mt-1">
                {song.status ?? "unknown"} | {song.isPublic ? "public" : "private"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid xl:grid-cols-2 gap-6">
        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Chi tiết bài hát</h2>
            <span className="text-xs text-gray-400">Thông tin phát nhạc</span>
          </div>

          <div className="space-y-4">
            {songDetailError && <p className="text-red-400 text-sm">{songDetailError}</p>}
            {songDetail && (
              <pre className="bg-spotify-base p-3 rounded-lg text-xs overflow-auto max-h-64">
                {JSON.stringify(songDetail, null, 2)}
              </pre>
            )}

            {!songDetail && !songDetailError && (
              <p className="text-sm text-gray-400">Chọn một bài hát ở trên để xem chi tiết.</p>
            )}

            <p className="text-xs text-gray-400">
              Key giải mã cho bài private sẽ được PlayerBar gọi tự động khi phát nhạc thông qua endpoint `/songs/:id/key`.
            </p>

            {activeSongId && currentSong?._id === activeSongId && (
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-2 bg-white text-black rounded-lg px-3 py-2 font-semibold"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                {isPlaying ? "Tạm dừng" : "Phát tiếp"}
              </button>
            )}
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Upload Song</h2>
            <span className="text-xs text-gray-400">Đăng tải nội dung</span>
          </div>

          <form onSubmit={handleUploadSong} className="space-y-3">
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="w-full bg-spotify-base rounded-lg px-3 py-2 outline-none border border-transparent focus:border-spotify-green"
              placeholder="Tên bài hát"
            />

            <label className="flex items-center gap-2 bg-spotify-base rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={uploadPublic}
                onChange={(e) => setUploadPublic(e.target.checked)}
              />
              Public
            </label>

            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full bg-spotify-base rounded-lg px-3 py-2"
            />

            <button
              type="submit"
              disabled={!isAuthenticated || uploading}
              className="w-full bg-spotify-green text-black rounded-lg px-3 py-2 font-semibold disabled:opacity-50"
            >
              {uploading ? "Đang upload..." : "Upload"}
            </button>
          </form>

          {!isAuthenticated && (
            <p className="text-yellow-300 text-sm mt-2">Cần đăng nhập để gọi endpoint upload.</p>
          )}
          {uploadResult && <p className="text-sm text-gray-200 mt-2">{uploadResult}</p>}

          <p className="text-xs text-gray-400 mt-3">
            Sau khi upload, bài hát sẽ vào trạng thái `processing`. Khi worker xử lý xong, bài hát sẽ xuất hiện lại trong danh sách phát.
          </p>
        </section>
      </div>

      <section className="text-xs text-gray-500 px-1">
        Gợi ý: click vào một card bài hát để phát bằng PlayerBar phía dưới. Luồng phát private/public sẽ được xử lý tự động theo backend.
      </section>
    </div>
  );
}
