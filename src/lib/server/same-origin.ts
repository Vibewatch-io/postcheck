/**
 * True when the browser is fetching for a page on this same origin. `same-site` is refused too: a
 * sibling subdomain is a different origin, and the GT America licence boundary is this site, not
 * every host under its domain.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  if (site) return false; // same-site, cross-site, none
  // No Fetch Metadata (older browsers, non-browser clients): fall back to Origin / Referer.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  for (const name of ["origin", "referer"]) {
    const value = req.headers.get(name);
    if (!value) continue;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  }
  return false;
}
