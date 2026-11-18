/**
 * A whole check of a draft, in code: the tips the site shows (advice.ts) and how every device lays the
 * text out (layout/), with no browser. The caller resolves the link lookups first (`linksOf` says which;
 * the check API does them server-side), so this stays pure and runs anywhere.
 */
import { buildAdvice, danglingWords, type Advice } from "./advice";
import type { CardData } from "./card";
import { DEFAULT_DEVICE, DEFAULT_PHONE_ID, DEVICES, type Device } from "./devices";
import { trimDraft } from "./draft";
import { MAX_WEIGHTED_LENGTH, extractEntities, showMoreCut, statusId, stripFormatting, tokenize, weightedLength, type StyleRun } from "./entities";
import { APP_MIN_RATIO, mediaLayout, type MediaKind } from "./media";
import { POLL_MIN_CHOICES, filledChoices, shownPoll, type Poll } from "./poll";
import { foldFor, hiddenUrlStart, linkAttachment } from "./post-model";
import { layoutBody, visibleLines, type Layout } from "./layout";

export type Badge = "none" | "blue" | "gold" | "gray";
export const BADGES: Badge[] = ["none", "blue", "gold", "gray"];

export interface Draft {
  /** The post as it will be typed. `**bold**` and `__italic__` mark Premium styling unless `plain`. */
  text: string;
  plain?: boolean;
  /** Attached media by kind and pixel size (X shows it instead of any card). */
  media?: Array<{ kind: MediaKind; width: number; height: number }>;
  /** A text poll's choices. */
  poll?: string[];
}

/** What the link lookups answered: a card (or why there is none), and whether a quoted post exists. */
export interface Lookups {
  /** "unknown": the lookup couldn't be made or didn't answer; the link text is kept, as the site keeps it while loading. */
  card?: CardData | "none" | "failed" | "unknown";
  quote?: "found" | "unavailable" | "unknown";
}

export interface CheckOptions {
  /** The posting account's check mark: any check can post past 280. */
  badge?: Badge;
  /** The phone and web view the tips cover, as on the site (its defaults otherwise). */
  phone?: string;
  web?: string;
  /** Devices to lay out (default: the x.com timeline and every phone's timeline). */
  devices?: string[];
}

export interface DeviceReport {
  id: string;
  label: string;
  platform: "web" | "ios" | "android";
  page: "timeline" | "post";
  /** The lines a reader sees before any Show more tap ("" = a paragraph gap). */
  lines: string[];
  showMore: boolean;
  /** Words alone on the last line of a paragraph (timeline views). */
  dangling: string[];
  /**
   * Some of the text is drawn in a fallback font (an emoji, CJK, Thai, Arabic…), whose widths here are
   * Apple's: a reader's phone uses its own, so these breaks are estimates.
   */
  approximate: boolean;
}

export interface CheckResult {
  /** No tip is a fix. */
  ok: boolean;
  /** The post as X will publish it (trimmed, blank lines collapsed, styling markers removed). */
  text: string;
  length: { weighted: number; limit: number };
  /** The tips, as the site shows them for `previews`. */
  advice: Advice[];
  previews: string[];
  attachment:
    | { type: "media"; kinds: MediaKind[] }
    | { type: "poll"; choices: string[] }
    | { type: "quote"; found: boolean | null }
    | { type: "card"; card: Pick<CardData, "host" | "title" | "layout"> | null; reason?: "none" | "failed" | "unknown" }
    | null;
  devices: DeviceReport[];
}

const PHONES = DEVICES.filter((d) => d.kind === "phone");
const WEBS = DEVICES.filter((d) => d.kind !== "phone");

/** Every device a check can name: id, label, platform and page. */
export function deviceList() {
  return DEVICES.map((d) => ({ id: d.id, label: d.label, platform: platformOf(d), page: pageOf(d), width: d.width }));
}

const platformOf = (d: Device): DeviceReport["platform"] => (d.kind === "phone" ? (d.platform ?? "ios") : "web");
const pageOf = (d: Device): DeviceReport["page"] => (d.kind === "focal" || d.view === "post" ? "post" : "timeline");

interface Prepared {
  typed: string;
  post: string;
  styles: StyleRun[];
  media: NonNullable<Draft["media"]>;
  poll: Poll | null;
}

function prepare(draft: Draft): Prepared {
  const s = draft.plain ? { text: draft.text, styles: [] } : stripFormatting(draft.text);
  // As X stores it: the ends trimmed, runs of blank lines collapsed to one (trimDraft, as the site does).
  const { text: post, styles } = trimDraft({ text: s.text, styles: s.styles });
  const choices = draft.poll ?? [];
  return { typed: s.text, post, styles, media: draft.media ?? [], poll: choices.length ? { choices, images: choices.map(() => null), minutes: 24 * 60 } : null };
}

/** The lookups a draft needs before it can be checked: the card's address and the quoted post's number. */
export function linksOf(draft: Draft): { cardUrl: string | null; quoteId: string | null } {
  const { post, media, poll } = prepare(draft);
  const entities = extractEntities(post);
  const length = weightedLength(post, entities);
  const link = linkAttachment(entities, { media: media.length > 0, poll: shownPoll(poll, length.weighted) !== null });
  return { cardUrl: link.cardKey, quoteId: link.quote ? statusId(link.quote.href!) : null };
}

export function checkPost(draft: Draft, lookups: Lookups = {}, opts: CheckOptions = {}): CheckResult {
  const phone = PHONES.find((d) => d.id === (opts.phone ?? DEFAULT_PHONE_ID));
  const web = WEBS.find((d) => d.id === (opts.web ?? DEFAULT_DEVICE.id));
  if (!phone) throw new RangeError(`unknown phone "${opts.phone}"`);
  if (!web) throw new RangeError(`unknown web view "${opts.web}"`);
  const wanted = opts.devices ?? DEVICES.filter((d) => pageOf(d) === "timeline").map((d) => d.id);
  const unknown = wanted.filter((id) => !DEVICES.some((d) => d.id === id));
  if (unknown.length) throw new RangeError(`unknown device ${unknown.map((id) => `"${id}"`).join(", ")}`);

  const { typed, post, styles, media, poll } = prepare(draft);
  const entities = extractEntities(post);
  const length = weightedLength(post, entities);
  const cut280 = showMoreCut(post, length.limitIndex);
  const pollOnPost = shownPoll(poll, length.weighted);
  const link = linkAttachment(entities, { media: media.length > 0, poll: pollOnPost !== null });
  const card = link.cardKey ? (lookups.card ?? "unknown") : null;
  const cardShown = card !== null && typeof card === "object";
  const body = {
    tokens: tokenize(post, entities, styles.flatMap((r) => [r.start, r.end])),
    styles,
    hiddenUrlStart: hiddenUrlStart(post, link, cardShown),
    quoteShown: link.quote !== null,
    longQuote: link.quote !== null && length.weighted > MAX_WEIGHTED_LENGTH,
    showMore: cut280 < post.length,
  };
  // Only the devices the answer reads: the ones asked for, and the phone and web view the tips cover.
  const needed = DEVICES.filter((d) => wanted.includes(d.id) || d.id === phone.id || d.id === web.id);
  const layouts = new Map<string, Layout>(needed.map((d) => [d.id, layoutBody(body, d)]));
  const lineSets = [...layouts.values()];
  const phoneFold = foldFor(post, cut280, phone, layouts.get(phone.id));
  // Android cuts at 280 too: the fold tip is about the line fold only where it comes first.
  const clamp = phoneFold.clamp && (phone.platform === "ios" || phoneFold.clamp.cut < cut280) ? phoneFold.clamp : null;
  const pollState = poll ? (pollOnPost ? "shown" : poll.choices.filter((c) => c.trim()).length < POLL_MIN_CHOICES ? "empty" : "dropped") : null;
  const advice = buildAdvice({
    text: post,
    entities,
    length,
    card: card === null ? null : card === "unknown" ? undefined : card === "none" ? null : card,
    lineSets,
    previews: [phone.id, web.id],
    verified: (opts.badge ?? "none") !== "none",
    appClamp: clamp ? { maxLines: clamp.maxLines, total: clamp.total, lastWord: clamp.lastWord, deviceLabel: phone.tipLabel ?? phone.label, deviceId: phone.id, platform: phone.platform ?? "ios" } : null,
    hasMedia: media.length > 0,
    mediaKinds: media.map((m) => m.kind),
    mediaLayouts: [web, phone].flatMap((d) => {
      const layout = mediaLayout(media, d);
      return layout ? [{ deviceId: d.id, deviceLabel: d.tipLabel ?? d.label, layout, ios: d.platform === "ios", tall: media.length === 1 && media[0].kind === "photo" && media[0].width / media[0].height < APP_MIN_RATIO }] : [];
    }),
    poll: pollState,
    pollPictures: false,
    hasStyles: styles.length > 0,
    typed,
  });
  return {
    ok: !advice.some((a) => a.severity === "fix"),
    text: post,
    length: { weighted: length.weighted, limit: MAX_WEIGHTED_LENGTH },
    advice,
    previews: [phone, web].map((d) => d.tipLabel ?? d.label),
    attachment: media.length
      ? { type: "media", kinds: media.map((m) => m.kind) }
      : pollOnPost
        ? { type: "poll", choices: filledChoices(pollOnPost).map((c) => c.label) }
        : link.quote
          ? { type: "quote", found: lookups.quote === "found" ? true : lookups.quote === "unavailable" ? false : null }
          : link.cardEntity && !link.cardEntity.isStatus
            ? cardShown
              ? { type: "card", card: { host: card.host, title: card.title, layout: card.layout } }
              : { type: "card", card: null, reason: card === null ? "none" : (card as "none" | "failed" | "unknown") }
            : null,
    devices: wanted.map((id) => {
      const d = DEVICES.find((x) => x.id === id)!;
      const layout = layouts.get(id)!;
      const fold = foldFor(post, cut280, d, layout);
      return { id, label: d.label, platform: platformOf(d), page: pageOf(d), lines: visibleLines(post, layout, fold), showMore: fold.showMore, dangling: danglingWords(layout), approximate: layout.approximate };
    }),
  };
}
