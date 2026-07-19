import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Musical App",
  description: "Music streaming system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link
          rel="preload"
          href="/Loading.svg?v=20260715"
          as="image"
          type="image/svg+xml"
        />
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
      </body>
    </html>
  );
}
