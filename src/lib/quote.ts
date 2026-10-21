/**
 * The quoted post behind a link to an X status: what /api/quote returns and the
 * client draws inside the quote embed. Shared by the route and the preview.
 */

import { extractEntities, isTrailing, quoteUrl, showMoreCut, weightedLength } from "./entities";

/** Blue: Premium. Gold: verified organization. Gray: government. */
export type QuoteBadge = "none" | "blue" | "gold" | "gray";

export interface QuoteData {
  id: string;
  name: string;
  handle: string;
  /** Data URL, so the PNG export can draw it. */
  avatar: string | null;
  badge: QuoteBadge;
  /** The text as posted: t.co links expanded, media links dropped. */
  text: string;
  /** ISO 8601. */
  createdAt: string;
  /** The first photo (data URL) and its size in pixels; quotes show one photo in the embed. */
  photo: { src: string; width: number; height: number } | null;
  /** A quoted poll is not drawn: the embed says "Show this poll" (QUIRKS.md). */
  poll: boolean;
}

/**
 * ok: the post was found. unavailable: X has no public post by that number (deleted,
 * protected, suspended or never posted). error: the lookup itself failed.
 */
export type QuoteResult = { status: "ok"; quote: QuoteData } | { status: "unavailable" } | { status: "error" };

/** The preview's view of one lookup: in flight, or its answer and when it arrived (the clock the embed's timestamp reads). */
export type QuoteState = "loading" | (QuoteResult & { at: number });

/** One rule decides both whether a link is a post link and which post it names. */
export { statusId } from "./entities";

/**
 * What a quote embed shows of the quoted post: a long post only up to its own Show more cut, with
 * no Show more inside the embed (x.com and the Android app, @postcheck_test test 42b quoting test 05:
 * the first 280 characters, then the 5-line clamp). FxTwitter answers with the whole text. The iOS
 * app is assumed to cut the same way. A quoted post that is itself a quote carries its own post link
 * at the end of FxTwitter's text, outside X's 280 (twitter-text's `attachment_url`, assumed): it isn't
 * counted, so the embed keeps it as text (test 107) unless the text before it is long by itself.
 */
export function quotedText(text: string): string {
  const entities = extractEntities(text);
  const inner = quoteUrl(entities);
  const own = inner && isTrailing(text, inner) ? text.slice(0, inner.start).trimEnd() : text;
  if (weightedLength(own, extractEntities(own)).limitIndex >= own.length) return text;
  return text.slice(0, showMoreCut(text, weightedLength(text, entities).limitIndex));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The quoted post's timestamp as X prints it beside the handle. Under a day both
 * show seconds, minutes or hours ("5m", "3h"). Past a day x.com prints the date
 * ("Sep 16", observed on @postcheck_test test 42) and the iOS app counts days
 * ("1d", same post). The app's date after a week and x.com's year suffix are assumed.
 */
export function quoteTime(createdAt: string, now: number, platform: "web" | "app"): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(t);
  if (platform === "app") {
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
