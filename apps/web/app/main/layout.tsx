import { PlayerBar } from "@/components/player/player-bar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="pb-24">{children}</main>
      <PlayerBar />
    </div>
  );
}
