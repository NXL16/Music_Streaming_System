import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@musical/shared-types"],
  env: {
    // The root development launcher supplies DEV_CACHE_MODE. Expose only its
    // non-sensitive mode to browser code, so development uses one switch.
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
