"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Mic2,
  MonitorSpeaker,
} from "lucide-react";
import Hls from "hls.js";
import { usePlayerStore } from "@/src/store/usePlayerStore";
import { useAuthStore } from "@/src/store/useAuthStore";

// Hàm hỗ trợ format giây thành phút:giây (VD: 185s -> 3:05)
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" + s : s}`;
};

export default function PlayerBar() {
  const { currentSong, isPlaying, togglePlay, volume, setVolume } =
    usePlayerStore();
  const token = useAuthStore((state) => state.token);

  // Tham chiếu đến thẻ audio ẩn và instance của Hls
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // State cho thanh Tiến trình (Progress Bar)
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ==========================================
  // 1. LOGIC KHỞI TẠO HLS.JS (QUAN TRỌNG NHẤT)
  // ==========================================
  useEffect(() => {
    if (!currentSong || !currentSong.hlsMasterPath || !audioRef.current) return;

    // Dọn dẹp HLS cũ nếu đang phát bài khác
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    const audio = audioRef.current;

    // Kiểm tra trình duyệt có hỗ trợ HLS.js không (Chrome, Firefox, Edge...)
    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: function (xhr, url) {
          // BÍ QUYẾT DRM: Nếu HLS đang gọi API đi xin khóa giải mã (/key)
          // Ta lén nhét JWT Token vào Header để API Backend chấp nhận
          if (url.includes("/key") && token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        },
      });

      hlsRef.current = hls;
      hls.loadSource(currentSong.hlsMasterPath); // Link R2 của bạn
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Tải xong Playlist -> Tự động Play nhạc
        audio.play().catch((e) => console.log("Lỗi Autoplay:", e));
        if (!isPlaying) togglePlay(); // Đồng bộ state sang isPlaying: true
      });

      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          console.error("❌ HLS Error:", data);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            alert("Lỗi tải nhạc. Có thể bạn không có quyền nghe bài này!");
          }
        }
      });
    }
    // Dành cho Safari trên Mac/iOS (Hỗ trợ HLS Native gốc không cần thư viện)
    else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = currentSong.hlsMasterPath;
      audio.addEventListener("loadedmetadata", () => {
        audio.play();
        if (!isPlaying) togglePlay();
      });
    }

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [currentSong?.hlsMasterPath]); // Chạy lại hàm này mỗi khi click chọn bài hát mới

  // ==========================================
  // 2. ĐỒNG BỘ PLAY/PAUSE VÀ VOLUME
  // ==========================================
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // ==========================================
  // 3. TƯƠNG TÁC GIAO DIỆN (TUA NHẠC, CHỈNH ÂM)
  // ==========================================
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * duration;
  };

  const handleVolume = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    if (percent < 0) percent = 0;
    if (percent > 1) percent = 1;
    setVolume(percent);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-20 bg-black border-t border-spotify-elevated flex items-center justify-between px-4 z-50">
      {/* THẺ AUDIO ẨN LÀM NHIỆM VỤ PHÁT ÂM THANH */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          if (isPlaying) togglePlay();
          setCurrentTime(0);
        }}
      />

      {/* Thông tin bài hát (Trái) */}
      <div className="flex items-center gap-4 w-1/3">
        <div className="w-14 h-14 bg-spotify-elevated rounded flex-shrink-0 overflow-hidden">
          {currentSong?.thumbnails?.large && (
            <img
              src={currentSong.thumbnails.large}
              alt="cover"
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white truncate max-w-[200px]">
            {currentSong ? currentSong.title : "Chưa có bài hát"}
          </span>
          <span className="text-xs text-gray-400">
            {currentSong ? "Musical" : "---"}
          </span>
        </div>
      </div>

      {/* Control (Giữa) */}
      <div className="flex flex-col items-center justify-center w-1/3 gap-2">
        <div className="flex items-center gap-6">
          <button
            className="text-gray-400 hover:text-white disabled:opacity-50"
            disabled={!currentSong}
          >
            <SkipBack size={20} fill="currentColor" />
          </button>

          <button
            onClick={togglePlay}
            disabled={!currentSong}
            className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="ml-1" />
            )}
          </button>

          <button
            className="text-gray-400 hover:text-white disabled:opacity-50"
            disabled={!currentSong}
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        {/* Thanh Progress */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <span className="text-xs text-gray-400">
            {" "}
            {formatTime(currentTime)}
          </span>
          <div
            className="h-1 bg-spotify-elevated rounded-full w-full group cursor-pointer flex items-center"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-white group-hover:bg-spotify-green w-0 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <span className="text-xs text-gray-400">
            {formatTime(duration || currentSong?.duration || 0)}
          </span>
        </div>
      </div>

      {/* Volume (Phải) */}
      <div className="flex items-center justify-end gap-4 w-1/3 text-gray-400">
        <Mic2 size={16} className="hover:text-white cursor-pointer" />
        <MonitorSpeaker size={16} className="hover:text-white cursor-pointer" />
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="hover:text-white cursor-pointer" />
          <div
            className="w-24 h-1 bg-spotify-elevated rounded-full group cursor-pointer flex items-center py-2"
            onClick={handleVolume}
          >
            <div
              className="h-1 bg-white group-hover:bg-spotify-green rounded-full transition-all"
              style={{ width: `${volume * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
