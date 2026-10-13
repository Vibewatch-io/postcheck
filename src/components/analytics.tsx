import Script from "next/script";

/**
 * Umami: cookieless page-view counts, nothing unless both variables are set (README: Deploying).
 * The address goes without its fragment (a share link carries the whole post there) or query;
 * older trackers ignore those attributes, so the server must run Umami 2.16 or later.
 */
export function Analytics() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;
  return <Script src={src} data-website-id={websiteId} data-exclude-hash="true" data-exclude-search="true" strategy="afterInteractive" />;
}
