import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads live local data, so pages render per request (no Cache Components).
  serverExternalPackages: ["better-sqlite3", "libsql", "pg"],
  // schema.sql is read from process.cwd() at runtime; force it into the traced
  // output so it ships inside every serverless function (e.g. on Vercel).
  outputFileTracingIncludes: {
    "/**/*": ["./src/lib/repo/schema.sql"],
  },
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
