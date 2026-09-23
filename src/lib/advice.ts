import {
  MAX_WEIGHTED_LENGTH,
  cardUrl,
  quoteUrl,
  isTrailing,
  type Entity,
  type LengthInfo,
} from "./entities";
import type { CardData } from "./card";

export type Severity = "fix" | "tip" | "note";

export interface Advice {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

/** One measured line of the rendered body: words on it, in reading order. */
export interface LineInfo {
  words: string[];
  /** 0-based paragraph index (hard line breaks split paragraphs). */
  paragraph: number;
  /** UTF-16 offset just past the last word on the line. */
  end: number;
  /** Each word on the line with its text offsets and pixel edges (relative to the body's left edge). */
  spans: Array<{ start: number; end: number; left: number; right: number }>;
}

export interface DeviceLines {
  deviceId: string;
  deviceLabel: string;
  /** Post-screen probes are measured but not used for dangling-word checks. */
  view?: "timeline" | "post";
  lines: LineInfo[];
  /** Total rendered lines including blank ones. */
  total: number;
  /** Pixel width of the inline " Show more" token at this device's font. */
  tokenWidth: number;
}

export interface AdviceInput {
  text: string;
  entities: Entity[];
  length: LengthInfo;
  /** Card lookup result for the card URL: undefined = not fetched yet, null = no card. */
  card: CardData | null | undefined;
  /** Rendered line metrics per device, for dangling-word checks. */
  lineSets: DeviceLines[];
  /** Set when the app's line clamp would fold the post. */
  appClamp?: { maxLines: number; total: number; lastWord: string; deviceLabel: string } | null;
  /** An image is attached: X shows it instead of any link card. */
  hasMedia?: boolean;
  /** Bold / italic runs are present. */
  hasStyles?: boolean;
  /** The draft exactly as typed, before X's trimming and blank-line collapsing. */
  typed?: string;
}

const RANK: Record<Severity, number> = { fix: 0, tip: 1, note: 2 };

// Reach advice must not contradict X's published source, xai-org/x-algorithm (checked at
// 2d4a03c, 2026-09-15). "The ranker doesn't penalize it" is not the same as "do it".

export function buildAdvice(input: AdviceInput): Advice[] {
  const { text, entities, length, card, lineSets, hasMedia } = input;
  const out: Advice[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;

  const hashtags = entities.filter((e) => e.type === "hashtag");
  const urls = entities.filter((e) => e.type === "url");
  const first = entities.find((e) => e.type === "mention");

  if (first && trimmed.startsWith(first.text)) {
    out.push({
      id: "leading-mention",
      severity: "fix",
      title: `Opens with ${first.text}`,
      detail:
        "X treats a post that starts with a handle as a reply: it mostly reaches only people who follow both you and them. Put a word in front of the handle.",
    });
  }

  if (length.weighted > MAX_WEIGHTED_LENGTH) {
    out.push({
      id: "over-limit",
      severity: "fix",
      title: `${length.weighted} of ${MAX_WEIGHTED_LENGTH} characters`,
      detail:
        "The timeline shows the first 280 and folds the rest behind Show more, cut at the last word that fits. Accounts without Premium can't post past 280 at all. Whatever you want people to read has to land before the cut.",
    });
  } else if (length.weighted > 260 && length.emoji > 0) {
    out.push({
      id: "emoji-weight",
      severity: "note",
      title: "Emoji count double",
      detail: `Each emoji costs 2 of the 280. You have ${length.emoji}, which is ${length.emoji * 2} characters of budget.`,
    });
  }

  if (urls.length > 0) {
    const cu = quoteUrl(entities) ?? cardUrl(entities)!;
    const trailing = isTrailing(text, cu);
    if (urls.length > 1 && !cu.isStatus) {
      out.push({
        id: "multiple-urls",
        severity: "note",
        title: `${urls.length} links, one card`,
        detail: `X renders a single card, for the first link (${cu.display}). If that page has no card, there is none at all. The others stay as plain link text.`,
      });
    }
    if (hasMedia) {
      out.push({
        id: "media-beats-card",
        severity: "note",
        title: "Photo attached, so no card",
        detail: `With an image on the post X shows the image and never a link card, and the link stays as text: "${cu.display}". Even at the very end of the post it stays visible.`,
      });
    } else if (cu.isStatus) {
      out.push({
        id: "status-link",
        severity: "note",
        title: "Link to an X post",
        detail: trailing
          ? `A link to a post becomes a quote post, and because it's last, the URL text disappears.${urls.length > 1 ? " The quote replaces any link card." : ""}`
          : `A link to a post becomes a quote post. Move it to the end and the URL text disappears too.${urls.length > 1 ? " The quote replaces any link card." : ""}`,
      });
    } else if (card) {
      if (trailing) {
        out.push({
          id: "trailing-url-hidden",
          severity: "note",
          title: "Link text hidden, card shown",
          detail: `The link is the last thing in the post, so X drops the URL text and shows only the ${cu.host} card.`,
        });
      } else {
        out.push({
          id: "url-mid-text",
          severity: "tip",
          title: "Link text stays visible",
          detail: `Because the link sits inside the text, X prints it as "${cu.display}" and also shows the card. Move it to the very end and only the card remains.`,
        });
      }
    } else if (card === null) {
      out.push({
        id: "no-card",
        severity: "note",
        title: `No card for ${cu.host}`,
        detail:
          "That page has no Open Graph or Twitter Card tags, so X shows the link as plain text and no preview. The URL text stays visible even at the end of the post.",
      });
    }
  }

  // x-algorithm grox/flows/ptos: SpamHashTagAbuse → SpamHighRecall label → dropped from out-of-network For You.
  if (hashtags.length > 2) {
    out.push({
      id: "hashtags",
      severity: "tip",
      title: `${hashtags.length} hashtags`,
      detail:
        "A row of hashtags reads as spam, and X's spam classifier flags hashtag abuse. Keep one if it names a real community, otherwise drop them.",
    });
  }

  const longMention = text.match(/@([A-Za-z0-9_]{16,})/);
  if (longMention) {
    out.push({
      id: "mention-too-long",
      severity: "note",
      title: `@${longMention[1]} won't link`,
      detail: "Handles are at most 15 characters, so X leaves this one as plain text.",
    });
  }

  if (trimmed.length > 200 && !trimmed.includes("\n")) {
    out.push({
      id: "wall",
      severity: "tip",
      title: "One solid block",
      detail:
        "Over 200 characters with no line break. A break after the first sentence gives the eye a place to land while scrolling.",
    });
  }

  const typed = input.typed ?? text;
  if (/\n[ \t]*\n[ \t]*\n/.test(typed)) {
    out.push({
      id: "blank-lines",
      severity: "note",
      title: "Extra blank lines are removed",
      detail: "X keeps at most one blank line between paragraphs and drops the rest when you post. The preview shows what X keeps.",
    });
  }

  if (typed !== typed.trim()) {
    out.push({
      id: "outer-whitespace",
      severity: "note",
      title: "Leading or trailing whitespace",
      detail: "X trims space and blank lines from both ends before posting. The preview shows the trimmed version.",
    });
  }

  // Dangling words: a paragraph whose last rendered line holds a single short word.
  const seen = new Set<string>();
  for (const set of lineSets) {
    if (set.view === "post") continue;
    const byPara = new Map<number, LineInfo[]>();
    for (const line of set.lines) {
      if (line.paragraph < 0 || line.words.length === 0) continue;
      const arr = byPara.get(line.paragraph) ?? [];
      arr.push(line);
      byPara.set(line.paragraph, arr);
    }
    for (const lines of byPara.values()) {
      if (lines.length < 2) continue;
      const last = lines[lines.length - 1];
      if (last.words.length === 1 && last.words[0].length <= 12 && last.words[0] !== "") {
        const key = last.words[0];
        const where = seen.has(key) ? null : set.deviceLabel;
        if (!where) continue;
        seen.add(key);
        out.push({
          id: `orphan-${key}`,
          severity: "tip",
          title: `"${key}" dangles on its own line`,
          detail: `On ${set.deviceLabel} that paragraph wraps so the last line is just "${key}". Cut a word or add a few so the line break lands somewhere useful.`,
        });
      }
    }
  }

  if (input.hasStyles) {
    out.push({
      id: "premium-styles",
      severity: "note",
      title: "Bold and italic need Premium",
      detail: "Text styling only posts from a Premium account. The styled words cost no extra characters, but bold glyphs are wider, so line breaks and the phone fold move. On the web, italic is a slant; in the iOS app it shows as upright bold (observed on one post).",
    });
  }

  const clamped = input.appClamp;
  if (clamped) {
    out.push({
      id: "app-clamp",
      severity: "tip",
      title: `Collapses in the app after ${clamped.maxLines} lines`,
      detail: `The web shows all ${clamped.total} lines, but on ${clamped.deviceLabel} the app folds this behind Show more after "${clamped.lastWord}". Anything below that only shows after a tap.`,
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
