"use client";

import { useState } from "react";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { ChangePasswordPanel } from "@/components/profile/change-password-panel";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useProfile } from "@/lib/auth/use-profile";
import { useVideoArtwork } from "@/lib/settings/use-video-artwork";
import { useLyricsBackgroundMotion } from "@/lib/settings/use-lyrics-background-motion";

export default function SettingsPage() {
  const { user } = useProfile();
  const { videoArtworkEnabled, setVideoArtworkEnabled } = useVideoArtwork();
  const { lyricsBackgroundMotionEnabled, setLyricsBackgroundMotionEnabled } =
    useLyricsBackgroundMotion();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const appearanceSettings = [
    {
      id: "video-artwork",
      label: "Video artwork",
      description:
        "Animate cover artwork. Turn off to use still images and reduce resource usage.",
      enabled: videoArtworkEnabled,
      onChange: setVideoArtworkEnabled,
    },
    {
      id: "lyrics-background-motion",
      label: "Lyrics background motion",
      description:
        "Animate the lyrics background. Turn off to keep the background still.",
      enabled: lyricsBackgroundMotionEnabled,
      onChange: setLyricsBackgroundMotionEnabled,
    },
  ];

  return (
    <MusicPageLayout>
      <header className="mx-(--bodyGutter) mb-8">
        <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-(--systemPrimary)">
          Settings
        </h1>
      </header>

      <main className="w-full px-(--bodyGutter) pb-14">
        <div className="max-w-6xl">
          {appearanceSettings.map((setting) => (
            <section
              key={setting.id}
              className="flex items-center justify-between gap-4 py-5"
            >
              <div>
                <h2
                  id={`${setting.id}-label`}
                  className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]"
                >
                  {setting.label}
                </h2>
                <p
                  id={`${setting.id}-description`}
                  className="mt-1 text-(--systemSecondary) [font:var(--callout)]"
                >
                  {setting.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={setting.enabled}
                aria-labelledby={`${setting.id}-label`}
                aria-describedby={`${setting.id}-description`}
                onClick={() => setting.onChange(!setting.enabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--systemPrimary) ${setting.enabled ? "bg-(--keyColor)" : "bg-(--systemQuaternary)"}`}
              >
                <span
                  className={`absolute left-1 top-1 size-5 rounded-full bg-white ${setting.enabled ? "translate-x-5" : ""}`}
                />
              </button>
            </section>
          ))}

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
