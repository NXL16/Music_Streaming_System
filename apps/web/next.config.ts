import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  devIndicators: false,
  env: {
    NEXT_PUBLIC_DEV_CACHE_MODE: process.env.DEV_CACHE_MODE ?? "on",
  },
  async headers() {
    return [
      {
        source: "/Loading.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  allowedDevOrigins: ["192.168.1.102"],
};

export default nextConfig;
