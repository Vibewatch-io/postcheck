/**
 * Text entity extraction and length rules that mirror what X does to a post
 * once it is published. Kept dependency-free on purpose: this file is the
 * whole "parser", and every rule in it is annotated with where it came from.
 */

export type EntityType = "url" | "mention" | "hashtag" | "cashtag";

export interface Entity {
  type: EntityType;
  /** UTF-16 offsets into the source text. */
  start: number;
  end: number;
  /** The matched text as typed. */
  text: string;
  /** For URLs: the absolute URL (scheme added if missing). */
  href?: string;
  /** For URLs: what X renders as the link text (see displayUrl). */
  display?: string;
  /** For URLs: hostname without a leading "www.". */
  host?: string;
  /** For URLs: true when it points at an X/Twitter status (renders as a quote post). */
  isStatus?: boolean;
  /** x.com/i/article link (renders as an article card, URL text hidden). */
  isArticle?: boolean;
}

/** Weighted-length budget for a standard post. */
export const MAX_WEIGHTED_LENGTH = 280;
/** Every URL costs a fixed 23 regardless of length (t.co wrapping). */
export const URL_WEIGHT = 23;

// A pragmatic TLD list. Scheme-less URLs only autolink on X when the TLD is
// real, so an unknown TLD without "https://" is treated as plain text, which
// is also what X does.
const TLDS = (
  "com net org io co ai app dev xyz info biz me tv gg so to ly sh fm am cc us uk ca de fr es it nl se no fi dk pl ru jp cn in au nz br mx ar ch at be ie pt cz hu ro gr tr za kr sg hk tw id ph vn th my ae il eu asia edu gov mil int news blog tech online site store shop cloud page link social crypto eth sol nft dao finance money bot chat games game live studio wtf lol fun club world today email agency digital network zone team tools art design foundation gl st ws tk ml ga cf im is la li lu md mn ms nu pw re si sk tc vc vg yt moe pro one run how ink top vip win wiki market capital ventures exchange trade systems solutions services company consulting media press academy build codes community earth energy events expert fund guru health help house institute land life management partners photos pics place plus report review reviews school science space support tips training video watch wine work works ninja rocks guide"
).split(" ");
// Longest first so "com" wins over "co" without relying on backtracking.
const TLD_ALT = [...new Set(TLDS)].sort((a, b) => b.length - a.length).join("|");

// Preceding-character rule from twitter-text: a URL can't follow a letter,
// digit, "@", "$", "#" or a bidi control. That keeps "user@example.com" from
// linking "example.com".
const URL_LEAD = String.raw`(^|[^A-Za-z0-9@$#\u202A-\u202E])`;
// With a scheme, any plausible domain links. Without one, the TLD must be real.
const SCHEME_URL_RE = new RegExp(
  URL_LEAD + String.raw`(https?:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?![a-z0-9-])(?::\d{2,5})?(?:[\/?#][^\s<>]*)?)`,
  "gi",
);
const BARE_URL_RE = new RegExp(
  URL_LEAD + String.raw`((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLD_ALT})(?![a-z0-9-])(?::\d{2,5})?(?:[\/?#][^\s<>]*)?)`,
  "gi",
);

const MENTION_RE = /(^|[^A-Za-z0-9_!#$%&*@＠])@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_@＠])/g;
const HASHTAG_RE = /(^|[^&\p{L}\p{N}_])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
const CASHTAG_RE = /(^|[^A-Za-z0-9_$])\$([A-Za-z]{1,6}(?:[._][A-Za-z]{1,2})?)(?![A-Za-z0-9_$])/g;

/** Emoji (incl. ZWJ sequences, skin tones, flags, keycaps). */
export const EMOJI_RE =
  /(?:\p{Regional_Indicator}\p{Regional_Indicator})|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;

const TRAILING_PUNCT = /[.,:;!?'"]+$/;

function trimUrlTail(match: string): string {
  let s = match.replace(TRAILING_PUNCT, "");
  // Drop an unbalanced closing paren: "(see example.com/a)" links "example.com/a".
  while (s.endsWith(")")) {
    const open = (s.match(/\(/g) || []).length;
    const close = (s.match(/\)/g) || []).length;
    if (close > open) s = s.slice(0, -1).replace(TRAILING_PUNCT, "");
    else break;
  }
  return s;
}

/**
 * What X prints as the link text. Scheme and "www." are stripped, and the
 * path is cut to 15 characters with an ellipsis. Verified against live posts:
 * "techcrunch.com/2019/08/29/twi…", "nytimes.com/2021/01/20/us/…",
 * "newsletter.theresanaiforthat.com/p/ai-beats-458…" (all exactly 15 path chars).
 */
export function displayUrl(raw: string): string {
  const s = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const cut = s.search(/[/?#]/);
  if (cut === -1) return s;
  const host = s.slice(0, cut);
  const rest = s.slice(cut);
  return rest.length > 15 ? `${host}${rest.slice(0, 15)}…` : host + rest;
}

export function hostOf(raw: string): string {
  const s = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const cut = s.search(/[/?#:]/);
  return (cut === -1 ? s : s.slice(0, cut)).toLowerCase();
}

export function extractEntities(text: string): Entity[] {
  const out: Entity[] = [];
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a);

  const urlMatches = [...text.matchAll(SCHEME_URL_RE), ...text.matchAll(BARE_URL_RE)];
  for (const m of urlMatches) {
    const lead = m[1].length;
    const start = m.index! + lead;
    const matched = trimUrlTail(m[2]);
    if (!matched) continue;
    const end = start + matched.length;
    if (!free(start, end)) continue;
    const href = /^https?:\/\//i.test(matched) ? matched : `https://${matched}`;
    const host = hostOf(matched);
    out.push({
      type: "url",
      start,
      end,
      text: matched,
      href,
      host,
      display: displayUrl(matched),
      isStatus: /^(x\.com|twitter\.com|mobile\.twitter\.com)$/.test(host) && /\/status\/\d+/.test(matched),
      isArticle: /^(x\.com|twitter\.com)$/.test(host) && /\/i\/article\/\d+/.test(matched),
    });
    taken.push([start, end]);
  }
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index! + m[1].length;
    const end = start + 1 + m[2].length;
    if (free(start, end)) out.push({ type: "mention", start, end, text: text.slice(start, end) });
  }
  for (const m of text.matchAll(HASHTAG_RE)) {
    const start = m.index! + m[1].length;
    const end = start + 1 + m[2].length;
    if (free(start, end)) out.push({ type: "hashtag", start, end, text: text.slice(start, end) });
  }
  for (const m of text.matchAll(CASHTAG_RE)) {
    const start = m.index! + m[1].length;
    const end = start + 1 + m[2].length;
    if (free(start, end)) out.push({ type: "cashtag", start, end, text: text.slice(start, end) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * twitter-text v3 weighting: most Latin/Cyrillic/etc. code points weigh 1,
 * everything else (CJK, most symbols) weighs 2, emoji weigh 2 regardless of
 * how many code points they take, and URLs weigh a flat 23.
 */
function codePointWeight(cp: number): number {
  if (cp <= 4351) return 1;
  if (cp >= 8192 && cp <= 8205) return 1;
  if (cp >= 8208 && cp <= 8223) return 1;
  if (cp >= 8242 && cp <= 8247) return 1;
  return 2;
}

export interface LengthInfo {
  weighted: number;
  /** UTF-16 index at which the 280 budget is exhausted (text.length when it fits). */
  limitIndex: number;
  /** Number of emoji found. */
  emoji: number;
}

export function weightedLength(text: string, entities: Entity[]): LengthInfo {
  const t = text.normalize("NFC");
  const urls = entities.filter((e) => e.type === "url");
  let weighted = 0;
  let limitIndex = -1;
  let emoji = 0;
  let i = 0;
  const emojiAt = new Map<number, number>();
  for (const m of t.matchAll(EMOJI_RE)) emojiAt.set(m.index!, m[0].length);
  while (i < t.length) {
    const url = urls.find((u) => u.start === i);
    let step: number;
    let w: number;
    if (url) {
      step = url.end - url.start;
      w = URL_WEIGHT;
    } else if (emojiAt.has(i)) {
      step = emojiAt.get(i)!;
      w = 2;
      emoji++;
    } else {
      const cp = t.codePointAt(i)!;
      step = cp > 0xffff ? 2 : 1;
      w = codePointWeight(cp);
    }
    if (weighted + w > MAX_WEIGHTED_LENGTH && limitIndex === -1) limitIndex = i;
    weighted += w;
    i += step;
  }
  if (limitIndex === -1) limitIndex = t.length;
  return { weighted, limitIndex, emoji };
}

/**
 * Where the timeline cuts a long post before "Show more". Measured on a live
 * long post: the visible prefix ends on a word boundary within the 280
 * budget, followed by an inline blue "Show more".
 */
export function showMoreCut(text: string, limitIndex: number): number {
  if (limitIndex >= text.length) return text.length;
  // A word that ends exactly on the limit fits (x.com posts 2089427094224974124, 2087554813450203482).
  if (/\s/.test(text[limitIndex])) return limitIndex;
  const head = text.slice(0, limitIndex);
  const lastBreak = Math.max(head.lastIndexOf(" "), head.lastIndexOf("\n"));
  return lastBreak > 0 ? lastBreak : limitIndex;
}

/**
 * The URL whose card X renders: the first link in the post. If that page has no
 * card, X shows none at all rather than trying the next link (@postcheck_test
 * tests 25–28: "Two cards" and "Two cards, reversed" both card the first link;
 * three card-less links give no card). A link to an X status becomes a quote
 * post instead of a card.
 */
export function cardUrl(entities: Entity[]): Entity | undefined {
  return entities.find((e) => e.type === "url");
}

/**
 * The post link X turns into a quote embed, if any: the last link to a status.
 * It becomes the quote wherever it sits in the text (its URL text stays visible
 * unless it is last) and no link card is shown beside a quote (@postcheck_test
 * tests 40, 41, 45). Links to X articles are plain links (test 46).
 */
export function quoteUrl(entities: Entity[]): Entity | undefined {
  return [...entities].reverse().find((e) => e.type === "url" && e.isStatus);
}

/** True when the entity is the final thing in the text (only whitespace after it). */
export function isTrailing(text: string, e: Entity): boolean {
  return text.slice(e.end).trim() === "";
}

/** A run of Premium text styling (bold / italic) over the posted text, UTF-16 offsets. */
export interface StyleRun {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
}

/**
 * Premium formatting, written in the composer as **bold** and __italic__ (the
 * markers are never posted; X stores styling as ranges over plain text).
 * Returns the text as it would be posted plus the style runs over it.
 */
export function stripFormatting(raw: string): { text: string; styles: StyleRun[] } {
  let text = "";
  const styles: StyleRun[] = [];
  let bold: number | null = null;
  let italic: number | null = null;
  const close = (start: number, isBold: boolean) => {
    if (text.length > start) styles.push({ start, end: text.length, bold: isBold, italic: !isBold });
  };
  for (let i = 0; i < raw.length; ) {
    if (raw.startsWith("**", i)) {
      if (bold === null) bold = text.length;
      else { close(bold, true); bold = null; }
      i += 2;
    } else if (raw.startsWith("__", i)) {
      if (italic === null) italic = text.length;
      else { close(italic, false); italic = null; }
      i += 2;
    } else {
      text += raw[i];
      i += 1;
    }
  }
  // An unclosed marker is just text: put it back.
  if (bold !== null) { text = text.slice(0, bold) + "**" + text.slice(bold); styles.forEach((r) => { if (r.start >= bold!) { r.start += 2; r.end += 2; } }); }
  if (italic !== null) { text = text.slice(0, italic) + "__" + text.slice(italic); styles.forEach((r) => { if (r.start >= italic!) { r.start += 2; r.end += 2; } }); }
  return { text, styles: styles.sort((a, b) => a.start - b.start) };
}

/** Style flags at a text offset. */
export function styleAt(styles: StyleRun[], at: number): { bold: boolean; italic: boolean } {
  let bold = false, italic = false;
  for (const r of styles) if (r.start <= at && at < r.end) { bold ||= r.bold; italic ||= r.italic; }
  return { bold, italic };
}

export type Token =
  | { kind: "word"; text: string; start: number; end: number }
  | { kind: "space"; text: string; start: number; end: number }
  | { kind: "newline"; start: number; end: number }
  | { kind: "entity"; entity: Entity; text: string; start: number; end: number };

/** Split text into render tokens: words, whitespace runs, newlines, entities. Offsets are UTF-16. */
export function tokenize(text: string, entities: Entity[], boundaries: number[] = []): Token[] {
  const tokens: Token[] = [];
  const cuts = new Set(boundaries);
  const pushPlain = (s: string, base: number) => {
    let at = base;
    for (const part of s.split(/(\n)/)) {
      if (part === "\n") tokens.push({ kind: "newline", start: at, end: at + 1 });
      else if (part) {
        for (const m of part.matchAll(/(\s+)|(\S+)/g)) {
          const start = at + m.index!;
          if (m[1]) tokens.push({ kind: "space", text: m[1], start, end: start + m[1].length });
          else {
            // Split a word where a style run starts or ends inside it.
            let from = start;
            const end = start + m[2].length;
            for (const b of [...cuts].filter((c) => c > from && c < end).sort((a, b) => a - b)) {
              tokens.push({ kind: "word", text: text.slice(from, b), start: from, end: b });
              from = b;
            }
            tokens.push({ kind: "word", text: text.slice(from, end), start: from, end });
          }
        }
      }
      at += part.length;
    }
  };
  let cursor = 0;
  for (const e of entities) {
    if (e.start > cursor) pushPlain(text.slice(cursor, e.start), cursor);
    tokens.push({ kind: "entity", entity: e, text: e.type === "url" ? e.display! : e.text, start: e.start, end: e.end });
    cursor = e.end;
  }
  if (cursor < text.length) pushPlain(text.slice(cursor), cursor);
  return tokens;
}

/**
 * Where the app folds a post that runs past its line limit. Tail truncation on
 * the last text line at or above the limit: take the longest prefix of that
 * line (cut only after a non-space character) that fits beside " Show more",
 * then drop one more character, then trim. Five iPhone samples at a 322px
 * body: "See the list live ↓" → "live"; "token price." → "token price";
 * "…saying on socials." → "…saying on"; "…grows to 80,000 customers" →
 * "…grows to 80,00". See QUIRKS.md.
 *
 * `spans` are the words on that line with pixel edges relative to the body's
 * left edge; a word's characters are assumed evenly spaced within it.
 */
export function appFoldCut(
  text: string,
  lineEnd: number,
  fit?: { spans: Array<{ start: number; end: number; left: number; right: number }>; tokenWidth: number; textWidth: number },
): number {
  const trimmedEnd = text.slice(0, lineEnd).trimEnd().length;
  if (!fit || fit.spans.length === 0) {
    const cps = [...text.slice(0, trimmedEnd)];
    cps.pop();
    return cps.join("").trimEnd().length;
  }
  const { spans, tokenWidth, textWidth } = fit;
  // Candidate cuts: after every character of every word on the line, with the right edge of what remains.
  const candidates: Array<{ cut: number; right: number }> = [];
  for (const sp of spans) {
    const graphemes = [...text.slice(sp.start, sp.end)];
    let at = sp.start;
    for (let i = 0; i < graphemes.length; i++) {
      at += graphemes[i].length;
      candidates.push({ cut: at, right: sp.left + ((sp.right - sp.left) * (i + 1)) / graphemes.length });
    }
  }
  let k = candidates.length - 1;
  while (k >= 0 && (candidates[k].cut > trimmedEnd || candidates[k].right + tokenWidth > textWidth)) k -= 1;
  k -= 1; // the app always eats one more character
  const cut = k >= 0 ? candidates[k].cut : spans[0].start;
  return text.slice(0, cut).trimEnd().length;
}
