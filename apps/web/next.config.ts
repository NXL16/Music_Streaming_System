import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@musical/shared-types"],
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
  allowedDevOrigins: ["192.168.1.102"],
};

export default nextConfig;
