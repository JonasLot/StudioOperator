import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads live local data, so pages render per request (no Cache Components).
  serverExternalPackages: ["better-sqlite3"],
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
