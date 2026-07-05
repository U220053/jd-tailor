import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "puppeteer", "puppeteer-core", "@sparticuz/chromium-min"],
};

export default nextConfig;
