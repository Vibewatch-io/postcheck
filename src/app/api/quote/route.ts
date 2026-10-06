import { NextResponse } from "next/server";
import { NO_STORE, postOnly, readLookupField } from "@/lib/server/fetch-guard";
import { lookupQuote } from "@/lib/server/fxtwitter";
import type { QuoteResult } from "@/lib/quote";

/**
 * Looks up the post a link points at so the preview can draw the quote embed X
 * would show. Takes the status number only (the client parses it out of the
 * link), in a POST body like the other lookups: the rest of the URL never leaves
 * the browser, the number never sits in an address, and nothing is cached.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 8000;

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export async function POST(request: Request) {
  const id = (await readLookupField(request, "id")) ?? "";
  if (!/^\d{1,20}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400, headers: NO_STORE });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await lookupQuote(id, controller.signal).catch((): QuoteResult => ({ status: "error" }));
    return NextResponse.json(result, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
