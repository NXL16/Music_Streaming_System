import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@musical/shared-types"],
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
