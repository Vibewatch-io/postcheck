"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/** Vercel Web Analytics with the URL fragment removed: a share link carries the whole post there. */
export function Analytics() {
  return <VercelAnalytics beforeSend={(event) => ({ ...event, url: event.url.split("#")[0] })} />;
}
