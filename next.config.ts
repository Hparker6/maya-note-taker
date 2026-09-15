import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a separate build (e.g. for tests) live alongside a running `next dev` without touching .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The optional password proxy buffers request bodies; allow large PDF uploads through it.
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  serverExternalPackages: ["better-sqlite3", "unpdf"],
};

export default nextConfig;
