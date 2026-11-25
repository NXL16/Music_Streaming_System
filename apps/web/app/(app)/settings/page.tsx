"use client";

import { useState } from "react";
import styles from "./settings.module.css";
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
      description: "Play animated album covers when available.",
      enabled: videoArtworkEnabled,
      onChange: setVideoArtworkEnabled,
    },
    {
      id: "lyrics-background-motion",
      label: "Lyrics background motion",
      description: "Animate the background while viewing lyrics.",
      enabled: lyricsBackgroundMotionEnabled,
      onChange: setLyricsBackgroundMotionEnabled,
    },
  ];

  return (
    <MusicPageLayout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Settings</h1>
          <p>Manage your listening experience and account security.</p>
        </header>
        <div className={styles.groups}>
          <section
            className={styles.group}
            aria-labelledby="appearance-heading"
          >
            <div className={styles.groupIntro}>
              <h2 id="appearance-heading">Listening experience</h2>
              <p>Choose how your music looks and moves.</p>
            </div>
            <div className={styles.controls}>
              {appearanceSettings.map((setting) => (
                <div key={setting.id} className={styles.setting}>
                  <div>
                    <h3 id={setting.id + "-label"}>{setting.label}</h3>
                    <p id={setting.id + "-description"}>
                      {setting.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={setting.enabled}
                    aria-labelledby={setting.id + "-label"}
                    aria-describedby={setting.id + "-description"}
                    onClick={() => setting.onChange(!setting.enabled)}
                    className={styles.switch}
                  >
                    <span className={styles.track}>
                      <span className={styles.thumb} />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className={styles.group} aria-labelledby="security-heading">
            <div className={styles.groupIntro}>
              <h2 id="security-heading">Security</h2>
              <p>Keep your account protected.</p>
            </div>
            <div className={styles.controls}>
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
          <section className={styles.group} aria-labelledby="sessions-heading">
            <div className={styles.groupIntro}>
              <h2 id="sessions-heading">Sessions</h2>
              <p>Review where you are signed in and manage access.</p>
            </div>
            <SessionsPanel className={styles.controls} />
          </section>
        </div>
      </div>
    </MusicPageLayout>
  );
}
