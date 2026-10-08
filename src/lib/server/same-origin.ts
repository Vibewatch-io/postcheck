/**
 * True when the browser is fetching for a page on this same origin. `same-site` is refused too: a
 * sibling subdomain is a different origin, and the GT America licence boundary is this site, not
 * every host under its domain.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  if (site) return false; // same-site, cross-site, none
  // No Fetch Metadata (older browsers, non-browser clients): fall back to Origin / Referer, compared as
  // whole origins (scheme and host, normalised by URL) with the one this request was made to.
  const first = (name: string) => req.headers.get(name)?.split(",")[0].trim();
  let self: string;
  try {
    const proto = first("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
    self = new URL(`${proto}://${first("x-forwarded-host") || first("host") || new URL(req.url).host}`).origin;
  } catch {
    return false;
  }
  for (const name of ["origin", "referer"]) {
    const value = req.headers.get(name);
    if (!value) continue;
    try {
      return new URL(value).origin === self;
    } catch {
      return false;
    }
  }
  return false;
}
