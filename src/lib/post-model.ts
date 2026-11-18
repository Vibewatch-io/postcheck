/**
 * What X does with a post's text around the layout: which link becomes a quote or a card, the trailing
 * link it hides, and where each device folds the text behind Show more. Shared by the preview
 * (src/components/postcheck.tsx), the layout engine's tests and the check API, so they can't disagree.
 */
import type { DeviceLines } from "./advice";
import { cardless } from "./card";
import type { Device } from "./devices";
import { appFoldCut, cardUrl, isTrailing, quoteUrl, type Entity } from "./entities";

export interface LinkAttachment {
  /** The link X turns into a quote embed, if any. */
  quote: Entity | null;
  /**
   * The first link, when there's no quote: where a card would come from. Media or a poll still leave it
   * set (the link stays text and no card is built); `cardKey` says whether a card is looked up.
   */
  cardEntity: Entity | undefined;
  /** The address to look a card up for, or null when X never builds one here. */
  cardKey: string | null;
}

/**
 * A link to a post becomes a quote wherever it sits, and a quote beats a link card (@postcheck_test tests
 * 40, 41, 45). A link to an X article is a plain link: no card, no embed (test 46). Media or a poll
 * replaces both, and the link stays as text (test 95; the poll-and-quote case is assumed).
 */
export function linkAttachment(entities: Entity[], on: { media: boolean; poll: boolean }): LinkAttachment {
  const quote = !on.media && !on.poll ? (quoteUrl(entities) ?? null) : null;
  const cardEntity = quote ? undefined : cardUrl(entities);
  const cardKey = cardEntity && !cardEntity.isStatus && !on.media && !on.poll && !cardless(cardEntity.href!) ? cardEntity.href! : null;
  return { quote, cardEntity, cardKey };
}

/**
 * Where the trailing link X hides starts: the last link's text goes when its card or quote shows in its
 * place. A card that is still loading, missing or unreadable leaves the text in place.
 */
export function hiddenUrlStart(post: string, link: LinkAttachment, cardShown: boolean): number | null {
  const entity = link.quote ?? link.cardEntity;
  const shown = link.quote !== null || cardShown;
  return entity && shown && isTrailing(post, entity) ? entity.start : null;
}

export interface AppClamp {
  /** The text before the fold, as an offset into the post. */
  cut: number;
  total: number;
  maxLines: number;
  lastWord: string;
}

/** The app's line fold (devices.ts APP_MAX_LINES) on `d`, read from the post's measured lines. */
export function appClamp(post: string, d: Device, set: DeviceLines | undefined): AppClamp | null {
  if (!d.maxLines) return null;
  if (!set || set.total <= d.maxLines) return null;
  const row = set.lines[d.maxLines - 1];
  if (!row) return null;
  // The last text line at or above the limit carries the token.
  let r = d.maxLines - 1;
  while (r > 0 && set.lines[r].spans.length === 0) r -= 1;
  const cut = appFoldCut(post, row.end, { spans: set.lines[r].spans, tokenWidth: set.tokenWidth, textWidth: d.textWidth }, d.platform === "ios");
  const lastWord = post.slice(0, cut).split(/\s+/).pop() ?? "";
  return { cut, total: set.total, maxLines: d.maxLines, lastWord };
}

/**
 * Where `d` cuts the text before Show more. The post page (web and app) always shows the whole text, and
 * so does a timeline post once its Show more has been clicked (`expanded`). The iOS app folds by
 * rendered lines only: a long post shows its first 9 lines, not X's 280 cut (Write/status/
 * 1646674962055565319 on an iPhone 15 Pro), and a long post under 10 lines shows whole (@postcheck_test
 * tests 05, 06, 08). The web and the Android app cut at 280 (tests 05–08), and Android also folds past 9
 * lines since 2026-10-21 (tests 12, 13, 97): whichever comes first.
 */
export function foldFor(post: string, cut280: number, d: Device, set: DeviceLines | undefined, expanded = false): { cut: number; showMore: boolean; clamp: AppClamp | null } {
  if (d.kind === "focal" || d.view === "post" || expanded) return { cut: post.length, showMore: false, clamp: null };
  const clamp = appClamp(post, d, set);
  if (d.kind === "phone" && d.platform === "ios") return { cut: clamp ? clamp.cut : post.length, showMore: Boolean(clamp), clamp };
  const cut = clamp ? Math.min(cut280, clamp.cut) : cut280;
  return { cut, showMore: cut < post.length, clamp };
}
