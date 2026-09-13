import type { NextConfig } from "next";

// Failover ships as a pure static/browser-rendered app: contracts are the
// source of truth, Next.js is used only for build + static delivery
// (App Router pages, no server actions, no database, no backend signer).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
