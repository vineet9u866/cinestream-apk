import type { NextConfig } from "next";

// Detect APK build mode: when building for Capacitor (static export), we set
// NEXT_OUTPUT=export in the environment. Otherwise we use the standalone
// output for normal Next.js deployments (with API routes).
const isApkBuild = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isApkBuild ? "export" : "standalone",
  // For static export: no image optimization (Capacitor serves static files)
  images: isApkBuild ? { unoptimized: true } : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
