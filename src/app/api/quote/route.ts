import { NextResponse } from "next/server";
import { cacheHeaders } from "@/lib/server/fetch-guard";
import { lookupQuote } from "@/lib/server/fxtwitter";
import type { QuoteResult } from "@/lib/quote";

/**
 * Looks up the post a link points at so the preview can draw the quote embed X
 * would show. Takes the status number only (the client parses it out of the
 * link): the rest of the URL never leaves the browser and never reaches a fetch.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  // Exactly one parameter: anything else would only mint new cache keys for the same answer.
  if (!/^\d{1,20}$/.test(id) || [...params.keys()].length !== 1) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await lookupQuote(id, controller.signal).catch((): QuoteResult => ({ status: "error" }));
    // A failed lookup is retried soon; a found or missing post is stable for an hour.
    return NextResponse.json(result, { headers: cacheHeaders(result.status === "error" ? 60 : 3600) });
  } finally {
    clearTimeout(timer);
  }
}
