import { HTML_CAP } from "./fetch-guard";
import type { NoCardReason } from "../card";

/**
 * Reads a page's <meta> tags and its <title>. The HTML is whatever a stranger's server sent, so
 * every scan is linear in its length: a page of unclosed `<meta ` or `<title>` tags, or one long
 * attribute name, must not hold the function (a synchronous regex can't be interrupted by the
 * route's timeout).
 */

/** A numeric reference past U+10FFFF is left as written: String.fromCodePoint would throw. */
function codePoint(ref: string, n: number): string {
  return n <= 0x10ffff ? String.fromCodePoint(n) : ref;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => codePoint(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(m, parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/** A name only starts where a run of name characters starts, so a long run is scanned once, not once per character. */
const ATTR = /(?<![a-zA-Z:-])([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const OPEN = /<(meta|title)(?=[\s/>])/gi;
const CLOSE_TITLE = /<\/title\s*>/gi;

/** `seen`, when given, collects every meta key on the page, including those with empty content. */
export function metaLookup(html: string, seen?: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const head = html.slice(0, HTML_CAP);
  let titleDone = false;
  OPEN.lastIndex = 0;
  for (let m = OPEN.exec(head); m; m = OPEN.exec(head)) {
    const end = head.indexOf(">", OPEN.lastIndex);
    if (end === -1) break; // no tag after this one can close either
    OPEN.lastIndex = end + 1;
    if (m[1].toLowerCase() === "meta") {
      const attrs = new Map<string, string>();
      for (const a of head.slice(m.index, end + 1).matchAll(ATTR)) {
        attrs.set(a[1].toLowerCase(), decodeEntities(a[3] ?? a[4] ?? a[5] ?? ""));
      }
      const key = (attrs.get("property") || attrs.get("name") || "").toLowerCase();
      const content = attrs.get("content");
      if (key) seen?.add(key);
      if (key && content && !out.has(key)) out.set(key, content);
    } else if (!titleDone) {
      // The first <title> only, and its closing tag is looked for once.
      titleDone = true;
      CLOSE_TITLE.lastIndex = end + 1;
      const close = CLOSE_TITLE.exec(head);
      if (close) {
        out.set("html:title", decodeEntities(head.slice(end + 1, close.index)));
        OPEN.lastIndex = close.index + close[0].length;
      }
    }
  }
  return out;
}

/** The tags a card is built from. */
export interface CardMeta {
  title: string;
  description: string;
  imageRaw: string;
  cardType: string;
}

/**
 * The card a page's tags make, or why there is none. X only builds a card from Twitter Card or Open
 * Graph tags; a page with just a <title> gets a plain link (@postcheck_test test 23, example.com).
 * Open Graph alone gives a small card (test 24). "none" means a page read to its end with no og: or
 * twitter: tag at all, empty or not. A page cut off at the cap may carry its tags past the cut, and
 * one whose tags make no card here (no title, empty, or none of the card keys) has no proof of what
 * X does, so both are "failed": Postcheck can't tell. Tags found before the cut still make a card.
 */
export function cardMeta(html: string, complete: boolean): CardMeta | NoCardReason {
  const seen = new Set<string>();
  const meta = metaLookup(html, seen);
  if (![...seen].some((k) => k.startsWith("og:") || k.startsWith("twitter:"))) return complete ? "none" : "failed";
  const social = ["twitter:card", "twitter:title", "og:title", "og:image"].some((k) => meta.get(k));
  const title = social ? meta.get("twitter:title") || meta.get("og:title") || meta.get("html:title") || "" : "";
  if (!title) return "failed";
  return {
    title,
    description: meta.get("twitter:description") || meta.get("og:description") || meta.get("description") || "",
    imageRaw: meta.get("twitter:image") || meta.get("twitter:image:src") || meta.get("og:image") || meta.get("og:image:url") || "",
    cardType: (meta.get("twitter:card") || "").toLowerCase(),
  };
}
