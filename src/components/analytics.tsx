import Script from "next/script";
import { SITE_URL } from "@/lib/site";

const SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

/**
 * Umami: cookieless page-view counts, nothing unless both variables are set (README: Deploying).
 * The address goes without its fragment (a share link carries the whole post there) or query, and
 * only from the site's own hostname, so previews and localhost never report.
 */
export function Analytics() {
  if (!SRC || !WEBSITE_ID) return null;
  return (
    <Script
      src={SRC}
      data-website-id={WEBSITE_ID}
      data-domains={new URL(SITE_URL).hostname}
      data-exclude-hash="true"
      data-exclude-search="true"
      strategy="afterInteractive"
    />
  );
}
