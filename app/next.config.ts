import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@percolator/core"],
  turbopack: {
    resolveAlias: {
      buffer: "buffer",
    },
  },
};

export default nextConfig;
