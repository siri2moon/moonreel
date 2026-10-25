import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Character reference uploads go through a server action.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // pg-boss and pg are server-only Node packages.
  serverExternalPackages: ["pg-boss", "pg"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
