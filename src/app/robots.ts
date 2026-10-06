import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Crawl the page, not the lookup routes. Fonts stay crawlable so renderers can draw the page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
