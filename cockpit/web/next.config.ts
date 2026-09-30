import type { NextConfig } from "next";

const API_BASE = process.env.API_BASE ?? "http://localhost:8010";

const nextConfig: NextConfig = {
  // SSE (copilot chat, replay stream) must not be buffered by compression.
  compress: false,
  // Hide the Next dev-tools "N" badge so it doesn't overlap the cockpit chrome.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },
};

export default nextConfig;
