import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['jsdom', 'firebase-admin'],
};

export default nextConfig;
