import { NextResponse } from "next/server";
import { NO_STORE, postOnly, readLookupField } from "@/lib/server/fetch-guard";
import { unfurl } from "@/lib/server/unfurl";
import type { UnfurlAnswer } from "@/lib/card";

/**
 * Fetches a page's Open Graph / Twitter Card metadata so the preview can show the card X would
 * render (see unfurl: http(s) only, public addresses only on every hop, short timeouts, byte caps).
 * The link arrives in a POST body and nothing is cached or logged: see readLookupField.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export async function POST(request: Request) {
  const raw = (await readLookupField(request, "url")) ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const answer = await unfurl(raw, controller.signal);
    if (!answer) return NextResponse.json({ error: "bad url" }, { status: 400, headers: NO_STORE });
    return NextResponse.json<UnfurlAnswer>(answer, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing outlives the answer: an unread body or a pending image fetch is dropped
  }
}
