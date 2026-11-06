"use client";

import { useState } from "react";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { ChangePasswordPanel } from "@/components/profile/change-password-panel";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useProfile } from "@/lib/auth/use-profile";

export default function SettingsPage() {
  const { user } = useProfile();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);

  return (
    <MusicPageLayout>
      <header className="mx-(--bodyGutter) mb-8">
        <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-(--systemPrimary)">
          Settings
        </h1>
      </header>

      <main className="w-full px-(--bodyGutter) pb-14">
        <div className="max-w-6xl">
          <section className="pb-7">
            <div>
              <ChangePasswordPanel
                open={passwordOpen}
                onToggle={() => setPasswordOpen((value) => !value)}
              />
              <TwoFactorPanel
                user={user}
                open={twoFactorOpen}
                onToggle={() => setTwoFactorOpen((value) => !value)}
              />
            </div>
          </section>

          <section className="py-7">
            <SessionsPanel className="w-full" />
          </section>
        </div>
      </main>
    </MusicPageLayout>
  );
}
