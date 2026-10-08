import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sameOrigin } from "@/lib/server/same-origin";

/**
 * Serves the GT America web fonts (Grilli Type), the stand-in for Chirp when
 * X's CDN is blocked. They are licensed to Vibewatch under Grilli Type's web
 * licence (self-hosted, @font-face only, served only to sites under the
 * licensee's control), so the files are never committed: locally they live in
 * .fonts/gt-america/, in production in a private Vercel Blob store linked to
 * the project (the SDK authenticates with the store token or Vercel OIDC).
 * Requests from other origins are refused so the fonts can't be hotlinked by
 * another site. Anything not in the allowlist 404s.
 *
 * Forks: without the files or a linked store this route 404s and the page
 * degrades to the system font, which font-tier.tsx reports honestly.
 */
export const runtime = "nodejs";

const ALLOWED = new Set(["GT-America-Standard-Regular.woff2", "GT-America-Standard-Bold.woff2"]);
/** The files sit at the store root; FONT_BLOB_PREFIX names a folder instead. */
const PREFIX = (process.env.FONT_BLOB_PREFIX ?? "").replace(/^\/|\/$/g, "");

/** One diagnostic per function instance, not one per request: a misconfigured store would otherwise log on every page view. */
const warned = new Set<string>();
/** Names the file only: the store folder (FONT_BLOB_PREFIX) stays out of the logs. */
function warnOnce(file: string, why: string) {
  if (warned.has(file)) return;
  warned.add(file);
  console.warn(`[fonts] ${file}: ${why} (degrading to the system font; further failures for this file are not logged)`);
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
    // No local copy: try the linked private store. Any failure degrades to the
    // system font (a 404 here is what font-tier.tsx expects), but say why in the
    // function logs so a misconfigured store is not mistaken for "no fonts".
    const pathname = PREFIX ? `${PREFIX}/${file}` : file;
    try {
      const result = await get(pathname, { access: "private" });
      if (!result) {
        warnOnce(file, "not found in the linked Blob store");
        return new NextResponse(null, { status: 404 });
      }
      if (result.statusCode !== 200) return new NextResponse(null, { status: 404 });
      return new NextResponse(result.stream, { headers });
    } catch (err) {
      warnOnce(file, `Blob read failed: ${err instanceof Error ? err.message : String(err)}`);
      return new NextResponse(null, { status: 404 });
    }
  }
}
