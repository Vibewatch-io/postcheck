import { HTML_CAP } from "./fetch-guard";

/**
 * Reads a page's <meta> tags and its <title>. The HTML is whatever a stranger's server sent, so
 * every scan is linear in its length: a page of unclosed `<meta ` or `<title>` tags, or one long
 * attribute name, must not hold the function (a synchronous regex can't be interrupted by the
 * route's timeout).
 */

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

/** A name only starts where a run of name characters starts, so a long run is scanned once, not once per character. */
const ATTR = /(?<![a-zA-Z:-])([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const OPEN = /<(meta|title)(?=[\s/>])/gi;
const CLOSE_TITLE = /<\/title\s*>/gi;

export function metaLookup(html: string): Map<string, string> {
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
