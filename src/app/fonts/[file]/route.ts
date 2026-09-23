import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";

/**
 * Serves the GT America web fonts (Grilli Type), the stand-in for Chirp when
 * X's CDN is blocked. They are licensed to Vibewatch under Grilli Type's web
 * licence (self-hosted, @font-face only, served only to sites under the
 * licensee's control), so the files are never committed: locally they live in
 * .fonts/gt-america/, in production in a private Vercel Blob store read with
 * the store's server token (BLOB_READ_WRITE_TOKEN, set by linking the store).
 * Requests from other origins are refused so the fonts can't be hotlinked by
 * another site. Anything not in the allowlist 404s.
 *
 * Forks: without the files or a linked store this route 404s and the page
 * degrades to the system font, which font-tier.tsx reports honestly.
 */
export const runtime = "nodejs";

const ALLOWED = new Set(["GT-America-Standard-Regular.woff2", "GT-America-Standard-Bold.woff2"]);
/** Folder inside the private store; override with FONT_BLOB_PREFIX. */
const PREFIX = (process.env.FONT_BLOB_PREFIX ?? "gt-america").replace(/^\/|\/$/g, "");

/** True when the browser is fetching for a page on this same host. */
function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return true;
  if (site === "cross-site") return false;
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

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED.has(file)) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  // Cached by the browser, not by shared caches: a CDN copy would bypass the origin check.
  const headers = { "content-type": "font/woff2", "cache-control": "private, max-age=31536000, immutable", vary: "Origin, Referer, Sec-Fetch-Site" };
  try {
    const bytes = await readFile(join(process.cwd(), ".fonts", "gt-america", file));
    return new NextResponse(bytes, { headers });
  } catch {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return new NextResponse(null, { status: 404 });
    try {
      const result = await get(`${PREFIX}/${file}`, { access: "private" });
      if (result?.statusCode !== 200) return new NextResponse(null, { status: 404 });
      return new NextResponse(result.stream, { headers });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
}
