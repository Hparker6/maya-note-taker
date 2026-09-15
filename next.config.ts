import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The optional password proxy buffers request bodies; allow large PDF uploads through it.
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  serverExternalPackages: ["better-sqlite3", "unpdf"],
};

export default nextConfig;
