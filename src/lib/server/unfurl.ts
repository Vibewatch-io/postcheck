import type { CardData, NoCardReason, UnfurlAnswer } from "@/lib/card";
import { HTML_CAP, discard, fetchImageAsDataUrl, guardedFetch, readCapped } from "./fetch-guard";
import { cardMeta } from "./meta";

/**
 * Reads a page's Open Graph / Twitter Card tags for the card X would show: http(s) only, public
 * addresses only (checked on every redirect hop), byte caps, and the image inlined as a data URL so
 * the browser never fetches a third-party asset for the export. `image: false` skips the image (the
 * check API only needs to know a card exists and how it's laid out). null: not a link at all.
 *
 * No card comes with a reason: "none" only for a page read in full that carries no social tags,
 * "failed" for anything that kept the page from being read.
 */
export async function unfurl(raw: string, signal: AbortSignal, opts: { image?: boolean } = {}): Promise<UnfurlAnswer | null> {
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (raw.length > 2048) return null;
  const noCard = (reason: NoCardReason): UnfurlAnswer => ({ card: null, reason });
  try {
    const { res, url: finalUrl } = await guardedFetch(target, "text/html,application/xhtml+xml", signal);
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
    if (imageRaw && opts.image !== false) {
      try {
        image = await fetchImageAsDataUrl(new URL(imageRaw, finalUrl), signal);
      } catch {
        image = null;
      }
    }
    const card: CardData = {
      url: finalUrl.toString(),
      host: finalUrl.hostname.replace(/^www\./, ""),
      title: title.slice(0, 200),
      description: description.slice(0, 300),
      image,
      // Without the image (the check API skips it) the layout follows the tags alone, assuming the image
      // loads; the site draws a small card when it can't fetch one.
      layout: (opts.image === false ? Boolean(imageRaw) : Boolean(image)) && cardType === "summary_large_image" ? "large" : "small",
    };
    return { card };
  } catch {
    return noCard("failed");
  }
}
