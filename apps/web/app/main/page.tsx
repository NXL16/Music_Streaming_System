import { SongCard } from "@/components/song/song-card";
import { Song } from "@/stores/player.store";

// Mock data tạm để test UI — sau thay bằng API call
const MOCK_SONGS: Song[] = [
  {
    id: "80d0e382-fc7b-4e61-bc6f-98ab0e3b7ff6",
    title: "In Love",
    artist: "Low G ft. JustaTee",
    coverUrl:
      "https://i.scdn.co/image/ab67616d0000b27323cf61113b6f831989e68725",
    duration: 0,
  },
];

export default function MainPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Bài hát</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {MOCK_SONGS.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </div>
  );
}
