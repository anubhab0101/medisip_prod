import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", process.env.APP_URL ?? "http://127.0.0.1:3000").href,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
