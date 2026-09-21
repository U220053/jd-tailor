import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "puppeteer", "puppeteer-core", "@sparticuz/chromium-min"],
};

export default nextConfig;
