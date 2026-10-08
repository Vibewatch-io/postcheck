import { NextResponse } from "next/server";
import { HTML_CAP, NO_STORE, discard, postOnly, fetchImageAsDataUrl, guardedFetch, readCapped, readLookupField } from "@/lib/server/fetch-guard";
import { metaLookup } from "@/lib/server/meta";
import type { CardData } from "@/lib/card";

/**
 * Fetches a page's Open Graph / Twitter Card metadata so the preview can show
 * the card X would render. The only server code in the project, so it is
 * deliberately paranoid: http(s) only, public addresses only (checked on every
 * redirect hop), short timeouts, hard byte caps, and the image is inlined as a
 * data URL so the browser never fetches a third-party asset for the export.
 * The link arrives in a POST body and nothing is cached or logged: see readLookupField.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

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
      return NextResponse.json({ card: null }, { headers: NO_STORE });
    }
    const bytes = await readCapped(res, HTML_CAP);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const meta = metaLookup(html);

    // X only builds a card from Twitter Card or Open Graph tags; a page with just a <title> gets a plain
    // link (@postcheck_test test 23, example.com). Open Graph alone gives a small card (test 24).
    const social = ["twitter:card", "twitter:title", "og:title", "og:image"].some((k) => meta.get(k));
    const title = social ? meta.get("twitter:title") || meta.get("og:title") || meta.get("html:title") || "" : "";
    const description = meta.get("twitter:description") || meta.get("og:description") || meta.get("description") || "";
    const imageRaw = meta.get("twitter:image") || meta.get("twitter:image:src") || meta.get("og:image") || meta.get("og:image:url") || "";
    const cardType = (meta.get("twitter:card") || "").toLowerCase();

    if (!title) return NextResponse.json({ card: null }, { headers: NO_STORE });

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
    return NextResponse.json({ card }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ card: null }, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing outlives the answer: an unread body or a pending image fetch is dropped
  }
}

