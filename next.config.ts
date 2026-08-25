import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host with `npm start` (scripts/start-standalone.mjs → node .next/standalone/server.js).
  // `next start` does not work with this output mode and can miss the project .env.
  output: "standalone",
  serverExternalPackages: ["tesseract.js", "unpdf", "pdfkit", "dotenv"],
  // Standalone tracing otherwise keeps only pdfkit.browser.mjs (no Helvetica).
  outputFileTracingIncludes: {
    "/api/loads/*/confirmation": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/pdfkit/package.json",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
