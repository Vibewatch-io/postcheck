import { NextResponse } from "next/server";
import { HTML_CAP, NO_STORE, discard, postOnly, fetchImageAsDataUrl, guardedFetch, readCapped, readLookupField } from "@/lib/server/fetch-guard";
import { cardMeta } from "@/lib/server/meta";
import type { CardData, NoCardReason, UnfurlAnswer } from "@/lib/card";

/**
 * Fetches a page's Open Graph / Twitter Card metadata so the preview can show
 * the card X would render. The only server code in the project, so it is
 * deliberately paranoid: http(s) only, public addresses only (checked on every
 * redirect hop), short timeouts, hard byte caps, and the image is inlined as a
 * data URL so the browser never fetches a third-party asset for the export.
 * The link arrives in a POST body and nothing is cached or logged: see readLookupField.
 *
 * No card comes with a reason (UnfurlAnswer): "none" only for a page read in full that carries no
 * social tags, "failed" for anything that kept the page from being read, so the advice never blames
 * a page's tags for a lookup that didn't get through.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

const noCard = (reason: NoCardReason) => NextResponse.json<UnfurlAnswer>({ card: null, reason }, { headers: NO_STORE });

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export async function POST(request: Request) {
  const raw = (await readLookupField(request, "url")) ?? "";
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400, headers: NO_STORE });
  }
  if (raw.length > 2048) return NextResponse.json({ error: "bad url" }, { status: 400, headers: NO_STORE });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { res, url: finalUrl } = await guardedFetch(target, "text/html,application/xhtml+xml", controller.signal);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || !type.includes("html")) {
      discard(res);
      return noCard("failed");
    }
    // One byte past the cap tells a page cut off at the cap from one that ends there.
    const bytes = await readCapped(res, HTML_CAP + 1);
    const complete = bytes.byteLength <= HTML_CAP;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, HTML_CAP));
    const found = cardMeta(html, complete);
    if (typeof found === "string") return noCard(found);
    const { title, description, imageRaw, cardType } = found;

    let image: string | null = null;
    if (imageRaw) {
      try {
        image = await fetchImageAsDataUrl(new URL(imageRaw, finalUrl), controller.signal);
      } catch {
        image = null;
      }
    }
    const host = finalUrl.hostname.replace(/^www\./, "");
    const card: CardData = {
      url: finalUrl.toString(),
      host,
      title: title.slice(0, 200),
      description: description.slice(0, 300),
      image,
      layout: image && cardType === "summary_large_image" ? "large" : "small",
    };
    return NextResponse.json<UnfurlAnswer>({ card }, { headers: NO_STORE });
  } catch {
    return noCard("failed");
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing outlives the answer: an unread body or a pending image fetch is dropped
  }
}

