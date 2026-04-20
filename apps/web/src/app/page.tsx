"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Song, usePlayerStore } from "../store/usePlayerStore";
import { api } from "../lib/api";

export default function HomePage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  // Lấy hàm playSong từ Kho chứa
  const playSong = usePlayerStore((state) => state.playSong);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        // Gọi API lấy danh sách bài hát
        const response = await api.get("/songs");
        // Theo cấu trúc API của bạn: response.data.data.songs
        setSongs(response.data.data.songs);
      } catch (error) {
        console.error("Lỗi tải danh sách bài hát:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  if (loading) {
    return (
      <div className="text-gray-400 font-semibold">
        Đang tải danh sách bài hát...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dành cho bạn</h1>

      {songs.length === 0 ? (
        <div className="text-gray-400">Chưa có bài hát nào trên hệ thống.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {songs.map((song) => (
            <div
              key={song._id}
              className="bg-spotify-highlight p-4 rounded-lg cursor-pointer hover:bg-spotify-elevated transition group relative"
              onClick={() => playSong(song)} // 👈 Click là đưa bài hát vào Player
            >
              {/* Ảnh bìa bài hát */}
              <div className="relative mb-4 pb-[100%] rounded-md shadow-lg overflow-hidden bg-gray-800">
                {song.thumbnails?.large && (
                  <img
                    src={song.thumbnails.large}
                    alt={song.title}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                )}

                {/* Nút Play xanh lá (hiện lên khi hover) */}
                <button className="absolute bottom-2 right-2 w-12 h-12 bg-spotify-green text-black rounded-full flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-xl hover:scale-105 z-10">
                  <Play fill="currentColor" size={24} className="ml-1" />
                </button>
              </div>

              {/* Thông tin bài hát */}
              <h3 className="font-bold text-white truncate">{song.title}</h3>
              <p className="text-sm text-gray-400 truncate mt-1">
                Unknown Artist
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
