import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return ["", "/super-cheese", "/nashville", "/reserve"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.8,
  }));
}
