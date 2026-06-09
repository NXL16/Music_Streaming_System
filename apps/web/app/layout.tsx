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
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
