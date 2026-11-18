import { NextResponse } from "next/server";
import { NO_STORE, postOnly, readJsonBody } from "@/lib/server/fetch-guard";
import { CHECK_BODY_CAP, CHECK_BODY_TIMEOUT_MS, authorize, parseCheckRequest, runCheck } from "@/lib/server/check";

/**
 * POST /api/check: a draft in, the site's tips and every device's line breaks out (src/lib/check.ts),
 * computed without a browser. Unlike the site, the caller sends the post's text here; it is used for
 * this one answer and never stored or logged. The first link and a quoted post's number are looked up
 * as the site looks them up. Open to anyone behind the /api/ rate limit; a key (POSTCHECK_API_KEY)
 * is exempt from it at the firewall. README: "Check a post from code".
 */
export const runtime = "nodejs";

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export async function POST(request: Request) {
  if (authorize(request) === "denied") {
    return NextResponse.json({ error: "unknown API key" }, { status: 401, headers: { ...NO_STORE, "www-authenticate": "Bearer" } });
  }
  const body = await readJsonBody(request, CHECK_BODY_CAP, CHECK_BODY_TIMEOUT_MS);
  if (body === undefined) return NextResponse.json({ error: "send a JSON body of at most 192 KB" }, { status: 400, headers: NO_STORE });
  const req = parseCheckRequest(body);
  if ("error" in req) return NextResponse.json({ error: req.error }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await runCheck(req), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "the check failed" }, { status: 500, headers: NO_STORE });
  }
}
