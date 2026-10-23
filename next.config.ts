import type { NextConfig } from "next";
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
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
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
