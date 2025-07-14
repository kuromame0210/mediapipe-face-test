import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // VRMViewer重複読み込み対策のため一時的に無効化
  /* config options here */
};

export default nextConfig;
