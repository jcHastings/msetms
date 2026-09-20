import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Keep 'unsafe-inline' for Next/React bootstrap + Maps loader; drop eval entirely.
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com",
  // Same-origin frames: Dispatch board slide-out loads /loads/:id?embed=1.
  // frame-src without 'self' + DENY/none painted a blank panel (broken document icon).
  "frame-src 'self' https://maps.googleapis.com https://maps.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Self-host with `npm start` (scripts/start-standalone.mjs → node .next/standalone/server.js).
  // `next start` does not work with this output mode and can miss the project .env.
  output: "standalone",
  poweredByHeader: false,
  // Next gzip of invoice PDFs + RSC flights stacked zlib listeners and froze the desk.
  compress: false,
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
