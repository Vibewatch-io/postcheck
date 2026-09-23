import { NextResponse } from "next/server";
import { HTML_CAP, cacheHeaders, fetchImageAsDataUrl, guardedFetch, readCapped } from "@/lib/server/fetch-guard";
import type { CardData } from "@/lib/card";

/**
 * Fetches a page's Open Graph / Twitter Card metadata so the preview can show
 * the card X would render. The only server code in the project, so it is
 * deliberately paranoid: http(s) only, public addresses only (checked on every
 * redirect hop), short timeouts, hard byte caps, and the image is inlined as a
 * data URL so the browser never fetches a third-party asset for the export.
 */
export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaLookup(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const head = html.slice(0, HTML_CAP);
  for (const tag of head.matchAll(/<meta\s+[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(a[1].toLowerCase(), decodeEntities(a[3] ?? a[4] ?? a[5] ?? ""));
    }
    const key = (attrs.get("property") || attrs.get("name") || "").toLowerCase();
    const content = attrs.get("content");
    if (key && content && !out.has(key)) out.set(key, content);
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) out.set("html:title", decodeEntities(title[1]));
  return out;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (raw.length > 2048) return NextResponse.json({ error: "bad url" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { res, url: finalUrl } = await guardedFetch(target, "text/html,application/xhtml+xml", controller.signal);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || !type.includes("html")) {
      return NextResponse.json({ card: null }, { headers: cacheHeaders() });
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

    if (!title) return NextResponse.json({ card: null }, { headers: cacheHeaders() });

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
    return NextResponse.json({ card }, { headers: cacheHeaders() });
  } catch {
    return NextResponse.json({ card: null }, { headers: cacheHeaders(300) });
  } finally {
    clearTimeout(timer);
  }
}

