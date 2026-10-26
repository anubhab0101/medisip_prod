import type { NextConfig } from "next";
const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval for dev; production should use nonces
  "style-src 'self' 'unsafe-inline'", // Tailwind uses inline styles
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  isProd ? "block-all-mixed-content" : "",
  "upgrade-insecure-requests",
].filter(Boolean).join("; ");

const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  serverExternalPackages: ["pdfmake"],
  outputFileTracingIncludes: {
    "/api/bills/*/pdf": ["./assets/fonts/**/*"],
    "/api/reports/pdf": ["./assets/fonts/**/*"],
  },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }] : []),
          ...(isProd ? [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }] : []),
          ...(isProd ? [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }] : []),
        ],
      },
      ...[
        "login",
        "dashboard",
        "billing",
        "bills",
        "medicines",
        "stock",
        "customers",
        "purchases",
        "appointments",
        "notifications",
        "reports",
        "settings",
        "deliveries",
        "offline",
        "offline-shell",
        "help",
        "api",
      ].map((path) => ({
        source: `/${path}/:path*`,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      })),
    ];
  },
};
export default config;
