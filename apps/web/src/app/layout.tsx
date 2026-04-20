import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import PlayerBar from "../components/layout/PlayerBar";
import SessionManager from "../components/session/SessionManager";

export const metadata: Metadata = {
  title: "Musical - Web Player",
  description: "Nghe nhạc HLS đỉnh cao",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="flex flex-col h-screen">
        <SessionManager />
        {/* Phần trên: Sidebar + Nội dung chính */}
        <div className="flex flex-1 overflow-hidden p-2 gap-2">
          <Sidebar />

          {/* Main Area */}
          <main className="flex-1 bg-spotify-base rounded-lg overflow-hidden flex flex-col relative">
            <Header />
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </main>
        </div>

        {/* Phần dưới đáy: Thanh phát nhạc */}
        <PlayerBar />
      </body>
    </html>
  );
}
