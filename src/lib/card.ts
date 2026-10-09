export interface CardData {
  url: string;
  host: string;
  title: string;
  description: string;
  /** Data URL (inlined server-side so PNG export can draw it) or null. */
  image: string | null;
  /** "large" = summary_large_image, "small" = summary. */
  layout: "large" | "small";
}

/**
 * Why a lookup found no card: "none" = the page was read to its end and has no Twitter Card or Open
 * Graph tags; "failed" = the lookup couldn't tell (an error status, not HTML, a timeout, a refused
 * address, a page cut off at the size cap, tags without a title), so whether X builds a card is unknown.
 */
export type NoCardReason = "none" | "failed";

/** What /api/unfurl answers: a card, or no card and why. */
export type UnfurlAnswer = { card: CardData } | { card: null; reason: NoCardReason };

/**
 * Links X builds no card for whatever the page carries, so the tool never looks one up and the link
 * text stays visible:
 * - the App Store, both the short `apps.apple.com/app/id…` form (a 301) and the direct
 *   `/us/app/x/id…` page, although the page has Open Graph tags (@postcheck_test test 122 on the web
 *   and in the app, 122b on the web);
 * - a typed link to an X article (`x.com/i/article/…`), a plain link on the web and in the app
 *   (test 46).
 */
export function cardlessKind(href: string): "app-store" | "x-article" | null {
  try {
    const url = new URL(href);
    if (url.hostname === "apps.apple.com") return "app-store";
    if (/^(www\.|mobile\.)?(x|twitter)\.com$/.test(url.hostname) && /^\/i\/article\/\d+\/?$/.test(url.pathname)) return "x-article";
    return null;
  } catch {
    return null;
  }
}

export function cardless(href: string): boolean {
  return cardlessKind(href) !== null;
}
