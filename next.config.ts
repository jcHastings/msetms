import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host with `node .next/standalone/server.js` (see scripts/start-standalone.mjs).
  // `next start` does not work with this output mode.
  output: "standalone",
  serverExternalPackages: ["tesseract.js", "unpdf", "pdfkit"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
