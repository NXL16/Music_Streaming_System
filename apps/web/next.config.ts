import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@musical/shared-types"],
};

export default nextConfig;
