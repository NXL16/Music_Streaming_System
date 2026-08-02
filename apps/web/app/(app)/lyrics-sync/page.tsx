"use client";

import { LyricsEditor } from "@/components/artist-studio/lyrics-editor";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { useAuthStore } from "@/lib/auth/auth-store";

export default function LyricsSyncPage() {
  const user = useAuthStore((state) => state.user);
  const canAuthor = [
    "ARTIST",
    "SUPER_ADMIN",
    "ADMIN_USER_OPS",
    "ADMIN_SECURITY_OPS",
  ].includes(user?.role ?? "");

  if (!canAuthor)
    return (
      <MusicPageLayout>
        <section className="mx-auto max-w-xl py-16 text-center">
          <h1 className="text-(--systemPrimary) [font:var(--title-1-emphasized)]">
            Lyrics Sync
          </h1>
          <p className="mt-3 text-(--systemSecondary)">
            Khu vực này dành cho nghệ sĩ và quản trị viên.
          </p>
        </section>
      </MusicPageLayout>
    );

  return (
    <MusicPageLayout>
      <main className="h-[90dvh] min-h-0 px-(--bodyGutter) pb-3">
        <LyricsEditor />
      </main>
    </MusicPageLayout>
  );
}
