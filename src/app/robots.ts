import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/login",
          "/api/",
          "/dashboard",
          "/billing",
          "/bills",
          "/medicines",
          "/stock",
          "/customers",
          "/purchases",
          "/appointments",
          "/notifications",
          "/reports",
          "/settings",
          "/deliveries",
          "/offline",
          "/help",
        ],
      },
    ],
    sitemap: new URL(
      "/sitemap.xml",
      process.env.APP_URL ?? "http://127.0.0.1:3000",
    ).href,
  };
}
