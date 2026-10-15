import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import "./fonts.css";
import "./globals.css";
import M404ContextualMenu from "@/components/custom-elements/m404-contextual-menu";
import { CreatePlaylistDialog } from "@/components/songs/create-playlist-dialog";
import { EditPlaylistDialog } from "@/components/songs/edit-playlist-dialog";
import { Toaster } from "sonner";
import { DeleteLibraryConfirmationDialog } from "@/components/songs/delete-library-confirmation-dialog";

export const metadata: Metadata = {
  title: "Music App",
  description: "Music streaming system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_CDN_URL && (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_CDN_URL}
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_CDN_URL} />
          </>
        )}
        {process.env.NEXT_PUBLIC_ASSET_URL && (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_ASSET_URL}
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_ASSET_URL} />
          </>
        )}

        <style>{`.playback-controls-play{width:var(--playback-control-button-width, 32px);height:var(--playback-control-button-height, 32px);display:flex;flex:0 0 auto;align-items:stretch;justify-content:stretch;position:relative}.playback-controls-play button{width:100%;height:100%;position:relative;transition:color 0.2s ease-out}.playback-controls-play m404-icon{width:var(--playback-control-icon-width, 32px);height:var(--playback-control-icon-height, 28px);display:block;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%)}button.playback-play__play,button.playback-play__pause,button.playback-play__stop{position:relative;transition:transform 0.2s ease-out;margin:0;padding:0;display:inline-block;border:0;background-color:transparent;outline:none;cursor:pointer;appearance:none;font-family:inherit;font-size:inherit;line-height:inherit;width:100%;height:100%;position:absolute;top:0;left:0;color:var(--playback-controls-play-color, #fff)}button.playback-play__play:enabled:active,button.playback-play__pause:enabled:active,button.playback-play__stop:enabled:active{transform:scale(0.9)}button.playback-play__play:enabled:active::before,button.playback-play__pause:enabled:active::before,button.playback-play__stop:enabled:active::before{width:38px;height:38px;opacity:0.2}button.playback-play__play::before,button.playback-play__pause::before,button.playback-play__stop::before{content:"";width:32px;height:32px;display:block;position:absolute;z-index:-1;top:50%;left:50%;transform:translate(-50%, -50%);border-radius:50%;background:#000;transition:opacity 0.2s ease-out;opacity:0}@media (prefers-color-scheme: dark){button.playback-play__play::before,button.playback-play__pause::before,button.playback-play__stop::before{background:#fff}}button.playback-play__play::-moz-focus-inner,button.playback-play__pause::-moz-focus-inner,button.playback-play__stop::-moz-focus-inner{border:0}button.playback-play__play:hover:not([disabled]),button.playback-play__play:focus-visible:not([disabled]),button.playback-play__pause:hover:not([disabled]),button.playback-play__pause:focus-visible:not([disabled]),button.playback-play__stop:hover:not([disabled]),button.playback-play__stop:focus-visible:not([disabled]){color:var(--playback-controls-play-color-hover, var(--playback-controls-play-color, #fff))}button.playback-play__play:focus-visible,button.playback-play__pause:focus-visible,button.playback-play__stop:focus-visible{--sk-focus-offset:2px;outline:4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3)));outline-offset:var(--sk-focus-offset, 1px)}button.playback-play__play[aria-hidden=true],button.playback-play__pause[aria-hidden=true],button.playback-play__stop[aria-hidden=true]{opacity:0;pointer-events:none}button.playback-play__play:disabled,button.playback-play__pause:disabled,button.playback-play__stop:disabled{opacity:0.4;cursor:default}.button__label{position:absolute;clip:rect(1px, 1px, 1px, 1px);clip-path:inset(0 0 99.9% 99.9%);overflow:hidden;height:1px;width:1px;padding:0;border:0}`}</style>
        <style>{`.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`}</style>
      </head>
      <body>
        <svg style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg">
          <symbol id="play-circle-fill" viewBox="0 0 60 60">
            <path
              fill="var(--iconCircleFillBG, transparent)"
              d="M30 60c16.411 0 30-13.617 30-30C60 13.588 46.382 0 29.971 0 13.588 0 .001 13.588.001 30c0 16.383 13.617 30 30 30Z"
            />
            <path
              fill="var(--iconFillArrow, var(--keyColor, black))"
              d="M24.411 41.853c-1.41.853-3.028.177-3.028-1.294V19.47c0-1.44 1.735-2.058 3.028-1.294l17.265 10.235a1.89 1.89 0 0 1 0 3.265L24.411 41.853Z"
            />
          </symbol>
        </svg>

        <AuthProvider>{children}</AuthProvider>
        <M404ContextualMenu />
        <CreatePlaylistDialog />
        <EditPlaylistDialog />
        <DeleteLibraryConfirmationDialog />
        <Toaster
          position="bottom-right"
          toastOptions={{
            actionButtonStyle: {
              background: "var(--button-pill-background-color, #000)",
              borderRadius: "6px",
              color: "var(--button-pill-color, #fff)",
              fontWeight: 600,
              height: "28px",
              padding: "0 12px",
            },
            style: {
              bottom: "-6px",
              right: "-5px",
              background: "var(--systemStandardThickMaterialSover)",
              color: "var(--systemPrimary)",
              border: "none",
              boxShadow:
                "inset 0 0 0 1px #fff3, 0 8px 40px var(--dialogShadowColor)",
              backdropFilter: "blur(60px) saturate(220%)",
            },
          }}
        />
      </body>
    </html>
  );
}
