import {
  MAX_WEIGHTED_LENGTH,
  cardUrl,
  quoteUrl,
  isTrailing,
  type Entity,
  type LengthInfo,
} from "./entities";
import { cardlessKind, type CardData } from "./card";
import { APP_MAX_HEIGHT, APP_MIN_RATIO, WEB_MAX_HEIGHT, overflows, type MediaKind, type MediaLayout } from "./media";

export type Severity = "fix" | "tip" | "note";

/**
 * Where a tip points in the preview: a character of the text (its line is marked), the Show more
 * fold, or the card / photo / quote under the text. `devices` limits a mark to the previews it is
 * true for (a word dangles at one width and not another).
 */
export type Mark = ({ at: number } | { el: "more" | "attachment" }) & { devices?: string[] };

export interface Advice {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  marks?: Mark[];
}

/** One measured line of the rendered body: words on it, in reading order. */
export interface LineInfo {
  words: string[];
  /** 0-based paragraph index (hard line breaks split paragraphs). */
  paragraph: number;
  /** UTF-16 offset just past the last word on the line. */
  end: number;
  /** Each word on the line with its text offsets and pixel edges (relative to the body's left edge). */
  spans: Array<{ start: number; end: number; left: number; right: number; link?: boolean; cont?: boolean }>;
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
  /**
   * Card for the card URL: undefined = not answered yet; null = no card for certain (the page has no
   * tags, or X never builds one for this kind of link); "failed" = the lookup couldn't read the page.
   */
  card: CardData | null | "failed" | undefined;
  /** Rendered line metrics per device, for dangling-word checks. */
  lineSets: DeviceLines[];
  /** Set when the app's line clamp would fold the post. */
  appClamp?: { maxLines: number; total: number; lastWord: string; deviceLabel: string; deviceId?: string } | null;
  /** An image is attached: X shows it instead of any link card. */
  hasMedia?: boolean;
  /** What is attached, in order. */
  mediaKinds?: MediaKind[];
  /** How the media is laid out on each preview shown (the selected web layout and phone). */
  mediaLayouts?: Array<{ deviceId: string; deviceLabel: string; layout: MediaLayout; ios: boolean; tall: boolean }>;
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
      marks: [{ at: first.start }],
    });
  }

  if (length.weighted > MAX_WEIGHTED_LENGTH) {
    out.push({
      id: "over-limit",
      severity: "fix",
      title: `${length.weighted} of ${MAX_WEIGHTED_LENGTH} characters`,
      detail:
        "The timeline shows the first 280 and folds the rest behind Show more, cut at the last word that fits. Accounts without Premium can't post past 280 at all. Whatever you want people to read has to land before the cut.",
      marks: [{ el: "more" }],
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
        marks: urls.filter((u) => u.start !== cu.start).map((u) => ({ at: u.start })),
      });
    }
    if (hasMedia) {
      const kinds = input.mediaKinds ?? ["photo"];
      const noun = kinds.length > 1 ? "Media" : kinds[0] === "gif" ? "GIF" : kinds[0] === "video" ? "Video" : "Photo";
      out.push({
        id: "media-beats-card",
        severity: "note",
        title: `${noun} attached, so no card`,
        detail: `With media on the post X shows the media and never a link card, and the link stays as text: "${cu.display}". Even at the very end of the post it stays visible.`,
        marks: [{ at: cu.start }],
      });
    } else if (cu.isStatus) {
      out.push({
        id: "status-link",
        severity: "note",
        title: "Link to an X post",
        detail: trailing
          ? `A link to a post becomes a quote post, and because it's last, the URL text disappears.${urls.length > 1 ? " The quote replaces any link card." : ""}`
          : `A link to a post becomes a quote post. Move it to the end and the URL text disappears too.${urls.length > 1 ? " The quote replaces any link card." : ""}`,
        marks: [trailing ? { el: "attachment" } : { at: cu.start }],
      });
    } else if (card === "failed") {
      // The lookup couldn't tell (the page didn't answer, or answered without a title): say only that.
      out.push({
        id: "card-lookup-failed",
        severity: "note",
        title: `Couldn't check ${cu.host}`,
        detail: "Postcheck couldn't read a card from that page, so the preview shows the link as plain text. X may still show a card when you post.",
        marks: [{ at: cu.start }],
      });
    } else if (card) {
      if (trailing) {
        out.push({
          id: "trailing-url-hidden",
          severity: "note",
          title: "Link text hidden, card shown",
          detail: `The link is the last thing in the post, so X drops the URL text and shows only the ${cu.host} card.`,
          marks: [{ el: "attachment" }],
        });
      } else {
        out.push({
          id: "url-mid-text",
          severity: "tip",
          title: "Link text stays visible",
          detail: `Because the link sits inside the text, X prints it as "${cu.display}" and also shows the card. Move it to the very end and only the card remains.`,
          marks: [{ at: cu.start }],
        });
      }
    } else if (card === null) {
      const kind = cardlessKind(cu.href!);
      out.push({
        id: "no-card",
        severity: "note",
        title: `No card for ${cu.host}`,
        detail:
          kind === "app-store"
            ? "X shows no preview for App Store links, even though the page has the tags for one. The URL text stays visible even at the end of the post."
            : kind === "x-article"
              ? "X shows a link to an X article as plain text, with no preview. The URL text stays visible even at the end of the post."
              : "Postcheck found no Open Graph or Twitter Card tags on that page. X builds a preview only from those, so the link shows as plain text. The URL text stays visible even at the end of the post.",
        marks: [{ at: cu.start }],
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
      marks: hashtags.map((h) => ({ at: h.start })),
    });
  }

  const longMention = text.match(/@([A-Za-z0-9_]{16,})/);
  if (longMention) {
    out.push({
      id: "mention-too-long",
      severity: "note",
      title: `@${longMention[1]} won't link`,
      detail: "Handles are at most 15 characters, so X leaves this one as plain text.",
      marks: [{ at: longMention.index! }],
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

  // Dangling words: a paragraph whose last rendered line holds a single short word. One tip per
  // word, marked on every preview where it dangles.
  const orphans = new Map<string, { tip: Advice; marks: Mark[]; where: string[] }>();
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
      // The tail of a token that wrapped (a link after "/", a word after a hyphen, CJK) isn't a word the
      // writer can move.
      if (last.words.length === 1 && last.words[0].length <= 12 && last.words[0] !== "" && !last.spans[0]?.cont) {
        const key = last.words[0];
        let orphan = orphans.get(key);
        if (!orphan) {
          const marks: Mark[] = [];
          orphan = { tip: { id: `orphan-${key}`, severity: "tip", title: `"${key}" dangles on its own line`, detail: "", marks }, marks, where: [] };
          orphans.set(key, orphan);
          out.push(orphan.tip);
        }
        if (!orphan.where.includes(set.deviceLabel)) orphan.where.push(set.deviceLabel);
        if (last.spans[0]) orphan.marks.push({ at: last.spans[0].start, devices: [set.deviceId] });
      }
    }
  }

  // The text names every preview the dots appear on, so the two never disagree.
  for (const [key, { tip, where }] of orphans) {
    const on = where.length === 1 ? where[0] : where.length === 2 ? `${where[0]} and ${where[1]}` : `${where[0]} and ${where.length - 1} other previews`;
    tip.detail = `On ${on} that paragraph wraps so the last line is just "${key}". Cut a word or add a few so the line break lands somewhere useful.`;
  }

  if (input.hasStyles) {
    out.push({
      id: "premium-styles",
      severity: "note",
      title: "Bold and italic need Premium",
      detail: "Text styling only posts from a Premium account. The styled words cost no extra characters, but bold glyphs are wider, so line breaks move wherever the styling shows. In the iPhone app's timeline, X shows the post with no bold or italic at all (a post that folds behind Show more gets it back once that's tapped), so the breaks and the fold there don't change; its post page shows the styling. That looks like an X bug, and the iPhone preview shows it the same way.",
    });
  }

  const layouts = input.mediaLayouts ?? [];
  // Only a carousel that runs past its column needs a swipe: four narrow strips fit in it whole.
  const sideways = layouts.filter((l) => l.layout.mode === "carousel" && overflows(l.layout));
  if (sideways.length) {
    const n = sideways[0].layout.boxes.length;
    const on = sideways.map((l) => l.deviceLabel).join(" and ");
    const cut = sideways.some((l) => l.layout.cropped) ? ", cutting wide ones at the sides" : "";
    out.push({
      id: "media-carousel",
      severity: "note",
      title: "Readers swipe to see the rest",
      detail: `On ${on}, X puts these ${n} items in a sideways carousel at one height${cut}. The next item peeks in from the edge; the rest take a swipe.`,
      marks: [{ el: "attachment", devices: sideways.map((l) => l.deviceId) }],
    });
  }
  const guessed = layouts.filter((l) => l.layout.assumed);
  if (guessed.length) {
    out.push({
      id: "media-assumed",
      severity: "note",
      title: "Very narrow images: sizes partly assumed",
      detail: guessed.some((l) => l.layout.assumed === "narrow-carousel")
        ? "How X sizes a row of four very narrow images comes from one capture (45 by 643 pixels each on x.com), so the preview copies it. Other counts and shapes may come out differently."
        : "No capture shows a very narrow image among wider ones in X's carousel, so the preview's 45px width for it is a guess.",
      marks: [{ el: "attachment", devices: guessed.map((l) => l.deviceId) }],
    });
  }
  const cropped = layouts.filter((l) => l.ios && l.tall && l.layout.mode === "single");
  if (cropped.length) {
    out.push({
      id: "media-tall-crop",
      severity: "note",
      title: "Tall photo cropped on iPhone",
      detail: `The iPhone timeline shows a photo this tall cropped to ${Math.round(APP_MIN_RATIO * APP_MAX_HEIGHT)} by ${APP_MAX_HEIGHT} points, so its top and bottom don't show there. x.com shows more of it, up to ${WEB_MAX_HEIGHT}px high.`,
      marks: [{ el: "attachment", devices: cropped.map((l) => l.deviceId) }],
    });
  }

  const clamped = input.appClamp;
  if (clamped) {
    out.push({
      id: "app-clamp",
      severity: "tip",
      title: `Collapses in the iOS app after ${clamped.maxLines} lines`,
      detail: `The web shows all ${clamped.total} lines, but on ${clamped.deviceLabel} the app folds this behind Show more after "${clamped.lastWord}". Anything below that only shows after a tap.`,
      marks: clamped.deviceId ? [{ el: "more", devices: [clamped.deviceId] }] : [],
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
