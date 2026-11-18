/**
 * Line layout in code: where a post's body breaks on a device, computed from Chirp's metrics
 * (metrics.ts) and the CSS the preview sets the body in (src/components/post-body.tsx: pre-wrap,
 * break-word, per-pane tracking). The site's folds and tips (src/components/postcheck.tsx) and the
 * hosted check (../check.ts) both read its answer, so they always agree; scripts/verify.mjs checks it
 * against the rows the preview draws for every corpus post.
 */
import type { DeviceLines, LineInfo } from "../advice";
import { rowHidesStyles, type Device } from "../devices";
import { emailRanges, styleAt, type StyleRun, type Token } from "../entities";
import { kernBetween, ligatureIn, measure, type RunStyle } from "./metrics";

/**
 * CSS letter-spacing on the Chirp tier (src/app/globals.css :root): x.com's untracked, the iOS
 * timeline's −0.18px and its post screen's −0.204px. tests/layout.test.ts reads globals.css to keep
 * these in step.
 */
export const TRACKING = { web: 0, app: -0.18, appPost: -0.204 };

export function trackingFor(d: Device): number {
  return d.pane === "web" ? TRACKING.web : d.view === "post" ? TRACKING.appPost : TRACKING.app;
}

export interface BodyInput {
  /** The whole post's tokens (tokenize over the trimmed post, cut at style edges). */
  tokens: Token[];
  styles: StyleRun[];
  /** Start of the trailing link whose text X hides (a card's or a quote's), or null. */
  hiddenUrlStart: number | null;
  /** The hidden link is a quote's: the Android app keeps its text. */
  quoteShown?: boolean;
  /** A long post's trailing post link: the iPhone keeps it as text. */
  longQuote?: boolean;
  /** The web's 280-cut " Show more": laid out after the whole text on web panes. */
  showMore: boolean;
  /** An expanded Android row shows its styling. */
  expanded?: boolean;
}

export interface Layout extends DeviceLines {
  /** Some characters were set in a fallback font, so their widths are estimates. */
  approximate: boolean;
}

/** One grapheme as laid out: its width, whether a line may break after it, and where it came from. */
interface Cell {
  text: string;
  width: number;
  /** The text node it sits in: Chrome adds a line up item by item, each item's width rounded up to 1/64px. */
  item: number;
  space: boolean;
  /** A line may break after this cell. */
  breakAfter: boolean;
  /** Index of the [data-w] piece it belongs to, or -1 (spaces, the Show more token). */
  piece: number;
  /** UTF-16 offset in the post just past this cell (words only). */
  end: number;
  /** The last cell of its [data-w] piece. */
  last?: boolean;
  /** The kerning with the next cell, counted in this one's width; a line that breaks right here loses it. */
  kernNext?: number;
  /** Part of the Show more token, which no row lists as a word. */
  token?: boolean;
}

interface Piece {
  text: string;
  start: number;
  end: number;
  /** Start of a link entity in the post (the span shows its display text, not the post's characters). */
  link?: number;
  paragraph: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const words = new Intl.Segmenter(undefined, { granularity: "word" });
/** UAX #14 SA: scripts broken by dictionary. */
const SA = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** No-break spaces: whitespace to tokenize(), glue to the line breaker. */
const GL = /^[\u00a0\u202f\u2007\u2060\ufeff]$/u;
const ID = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
/** No break before these (UAX #14 CL, CP, EX, IS, NS and the like). */
const NO_BREAK_BEFORE = /^[)\]}.,!?:;%'’"”»、。，．：；！？）」』】〕〉》ー々ゝゞぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ…‼⁉]/u;
/** No break after these (UAX #14 OP, opening quotes, and PR before an ideograph: LB23a). "#" and "@" are AL and may break before CJK. */
const NO_BREAK_AFTER = /[([{'‘"“«（「『【〔〈《$£€¥]$/u;

/**
 * Lay the body out on one device. `tokens`, `styles` and the rest describe the whole post as PostBody
 * would draw it; the result is the rows Chrome gives that body, each [data-w] span's fragments with
 * their offsets and edges.
 */
export function layoutBody(input: BodyInput, d: Device): Layout {
  const { paragraphs, pieces, approximate, tokenWidth } = cellsFor(input, d);
  return fill(paragraphs, pieces, d, approximate, tokenWidth);
}

interface Built {
  paragraphs: Cell[][];
  pieces: Piece[];
  approximate: boolean;
  tokenWidth: number;
}

/**
 * The body as cells for one device, built once per body and text setup: devices that differ only in
 * column width (the iPhone timelines, say) share them, and only the line filling runs per width.
 */
const built = new WeakMap<BodyInput, Map<string, Built>>();
function cellsFor(input: BodyInput, d: Device): Built {
  const android = d.platform === "android";
  const key = JSON.stringify([d.platform ?? "web", d.pane, d.font, d.fontSize, trackingFor(d), rowHidesStyles(d, android && Boolean(input.expanded))]);
  let byKey = built.get(input);
  if (!byKey) built.set(input, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const b = buildCells(input, d);
  byKey.set(key, b);
  return b;
}

function buildCells(input: BodyInput, d: Device): Built {
  const android = d.platform === "android";
  const shownStyles = rowHidesStyles(d, android && Boolean(input.expanded)) ? [] : input.styles;
  const hidden = (android && input.quoteShown) || (d.platform === "ios" && input.longQuote) ? null : input.hiddenUrlStart;
  if (d.font !== "web") throw new RangeError(`${d.id} lays text out in a Chirp build with no metrics (font "${d.font}")`);
  const base: RunStyle = { font: d.font, bold: false, size: d.fontSize, letterSpacing: trackingFor(d) };
  const linkBreaks = d.pane === "app" || android;

  // The body's nodes, as PostBody emits them: words and entities as pieces, spaces and newlines as text.
  type Node = { kind: "piece"; piece: Piece; bold: boolean } | { kind: "space"; text: string } | { kind: "newline" };
  const nodes: Node[] = [];
  let paragraph = 0;
  for (const t of input.tokens) {
    if (t.kind === "newline") {
      paragraph++;
      nodes.push({ kind: "newline" });
    } else if (t.kind === "space") nodes.push({ kind: "space", text: t.text });
    else if (t.kind === "entity") {
      if (t.entity.type === "url" && t.entity.start === hidden) continue;
      // An entity's span carries a colour but never the bold or italic of a style run.
      nodes.push({ kind: "piece", piece: { text: t.text, start: t.start, end: t.end, link: t.entity.type === "url" ? t.start : undefined, paragraph }, bold: false });
    } else nodes.push({ kind: "piece", piece: { text: t.text, start: t.start, end: t.end, paragraph }, bold: styleAt(shownStyles, t.start).bold });
  }
  // Whitespace (newlines included) before a hidden link or the token is dropped, as X trims it.
  while (nodes.length && nodes[nodes.length - 1].kind !== "piece") nodes.pop();

  // Paragraphs of cells.
  const paragraphs: Cell[][] = [[]];
  const pieces: Piece[] = [];
  let approximate = false;
  let prevText = "";
  let prevStyle: RunStyle | null = null;
  let item = 0;
  /** The next cell follows a <wbr>, which stops kerning across it (Android's word joiner doesn't). */
  let joiner = false;
  const push = (text: string, style: RunStyle, cell: Omit<Cell, "text" | "width" | "item">) => {
    const m = measure(text, style);
    approximate ||= m.approximate;
    // Chrome shapes a paragraph across its spans, so neighbours in the same face and weight kern even
    // across a span's edge, and through Android's word joiner (an ignorable character), but not across a
    // <wbr> ("github.com/" | "vercel/" measured unkerned; "end-to-end" with joiners kerned, 81.125px).
    const kern = prevStyle && prevStyle.bold === style.bold && !joiner ? kernBetween(prevText, text, style) : 0;
    joiner = false;
    // HarfBuzz adds a pair's kerning to the first glyph's advance, so it counts in that glyph's item.
    const para = paragraphs[paragraphs.length - 1];
    if (kern && para.length) {
      para[para.length - 1].width += kern;
      para[para.length - 1].kernNext = kern;
    }
    para.push({ text, width: m.width, item, ...cell });
    prevText = text;
    prevStyle = style;
  };
  for (const n of nodes) {
    if (n.kind === "newline") {
      paragraphs.push([]);
      prevText = "";
      prevStyle = null;
      continue;
    }
    if (n.kind === "space") {
      item++;
      // A no-break space (UAX #14 GL) holds its neighbours together and never hangs at a line's end.
      for (const { segment } of graphemes.segment(n.text)) {
        const glue = GL.test(segment);
        push(segment, base, { space: !glue, breakAfter: !glue, piece: -1, end: 0 });
      }
      continue;
    }
    const p = n.piece;
    const idx = pieces.push(p) - 1;
    const style = { ...base, bold: n.bold };
    const segs = clusters(p.text, style);
    // On the iOS pane an email address inside a word sits in spans of its own (post-body.tsx), so its
    // edges are text-item edges too (kerning carries across them).
    const emailEdges = d.pane === "app" && p.link === undefined ? new Set(emailRanges(p.text).flat()) : null;
    // Thai, Lao, Khmer and Myanmar have no spaces between words: Chrome breaks them at ICU's dictionary
    // word boundaries, which Intl.Segmenter gives too.
    const dictBreaks = SA.test(p.text) ? new Set([...words.segment(p.text)].map((w) => w.index).filter((i) => i > 0)) : null;
    let offset = 0;
    let at = p.link === undefined ? p.end - p.text.length : p.start;
    item++;
    segs.forEach((seg, i) => {
      if (p.link === undefined) at += seg.length;
      // Text nodes inside the span: a link's pieces between <wbr>s, Android's hyphen spans, email spans.
      const wbr = i > 0 && p.link !== undefined && linkBreaks && segs[i - 1] === "/";
      if (i > 0 && (wbr || (android && (seg === "-" || segs[i - 1] === "-")) || emailEdges?.has(offset))) {
        item++;
        if (wbr) joiner = true;
      }
      const next = segs[i + 1];
      offset += seg.length;
      // Breaks that only exist inside this span: the <wbr> after a link's "/", and dictionary word ends.
      // The general rules run over the whole paragraph below, across span edges as Chrome's do.
      const breakAfter = next !== undefined && ((p.link !== undefined && linkBreaks && seg === "/") || (Boolean(dictBreaks?.has(offset)) && SA.test(seg) && SA.test(next)));
      push(seg, style, { space: false, breakAfter, piece: idx, end: p.link === undefined ? at : p.end, last: i === segs.length - 1 });
    });
  }
  // On web panes the 280 cut's Show more follows the whole text: a space, then the token, which wraps
  // whole except on Android (inline there: "Show" | "more"). The app never appends it: a long post
  // under 10 lines shows whole there, so counting the token would push a full last line onto a 10th
  // row (test 94).
  if (input.showMore && d.pane === "web" && nodes.length) {
    item++;
    push(" ", base, { space: true, breakAfter: true, piece: -1, end: 0, token: true });
    item++;
    if (android) {
      push("Show", base, { space: false, breakAfter: false, piece: -1, end: 0, token: true });
      push(" ", base, { space: true, breakAfter: true, piece: -1, end: 0, token: true });
      push("more", base, { space: false, breakAfter: false, piece: -1, end: 0, token: true });
    } else push("Show more", base, { space: false, breakAfter: false, piece: -1, end: 0, token: true });
  }

  // UAX #14 over each paragraph's text as a whole, so a break can fall where two spans meet ("thanks—" |
  // "@alice", "self-" | "hosted" split by a style edge), as Chrome finds them.
  for (const cells of paragraphs) {
    cells.forEach((c, k) => {
      const next = cells[k + 1];
      if (c.space || c.token || c.breakAfter || !next || next.space || next.token) return;
      const [a, b] = [c.text, next.text];
      // No break on either side of a no-break space (UAX #14 LB12, LB12a).
      if (GL.test(a) || GL.test(b)) return;
      // Chrome's breaks between Latin characters, probed one by one (2026-11-18, overflow-wrap off): after
      // every hyphen-minus, digits and a word's start included ("2026-" | "11-18", "-" | "aaaa"); around an
      // em dash but not between two ("aa" | "——" | "bb"); after an en dash; after "?" and "…" before a
      // letter. Not at / . , : ! ( ) $ % & + = _ | ~ ' " * # @ ; [ ] { } • · →. Android's hyphen carries a
      // word joiner (post-body.tsx), so no break after "-" there.
      if (a === "-") c.breakAfter = !android;
      else if ((ID.test(a) || ID.test(b)) && !NO_BREAK_BEFORE.test(b) && !NO_BREAK_AFTER.test(a)) c.breakAfter = true;
      else if (a === "—" ? b !== "—" : b === "—") c.breakAfter = true;
      else if (/^[\u2010\u2012\u2013]$/.test(a)) c.breakAfter = true;
      else if ((a === "?" || a === "…") && /^[\p{L}\p{N}]/u.test(b)) c.breakAfter = true;
    });
  }

  return { paragraphs, pieces, approximate, tokenWidth: snap(measure(" Show more", base).width) };
}

/** The lines on one device: greedy filling at its column width (see the notes on Chrome above). */
function fill(paragraphs: Cell[][], pieces: Piece[], d: Device, approximate: boolean, tokenWidth: number): Layout {
  const rows: LineInfo[] = [];
  const firstRowOf = new Map<number, number>();
  const limit = d.textWidth;
  for (const cells of paragraphs) {
    if (!cells.length) {
      rows.push({ words: [], paragraph: -1, end: 0, spans: [] });
      continue;
    }
    let i = 0;
    while (i < cells.length) {
      // Fill a line: the last break opportunity whose content (trailing spaces hang) still fits.
      // Position = completed items, each snapped, plus the current item so far (snapped too).
      let done = 0;
      let cur = 0;
      let curItem = -1;
      let lastBreak = -1;
      let j = i;
      for (; j < cells.length; j++) {
        const c = cells[j];
        if (c.item !== curItem) {
          done += snap(cur);
          cur = 0;
          curItem = c.item;
        }
        // Could the line end after this cell? Chrome reshapes a line that breaks inside a word, so the
        // cell's kerning with the next one (on the next line) no longer counts.
        if (!c.space && done + snap(cur + c.width - (c.kernNext ?? 0)) > limit + EPSILON && j > i) break;
        cur += c.width;
        if (c.breakAfter) lastBreak = j;
      }
      let end: number; // exclusive
      if (j >= cells.length) end = cells.length;
      else if (lastBreak >= i) end = lastBreak + 1;
      else end = Math.max(j, i + 1); // nothing to break at: break-word cuts at the last cell that fits
      rows.push(rowOf(cells.slice(i, end), pieces, firstRowOf, rows.length));
      i = end;
      // A line never starts with the spaces that ended the one before (they hang there).
      while (i < cells.length && cells[i].space && !cells[i].token) i++;
    }
  }
  let carry = 0;
  for (const r of rows) {
    if (r.end) carry = r.end;
    else r.end = carry;
  }
  const view = d.kind === "focal" ? "post" : d.view;
  return { deviceId: d.id, deviceLabel: d.tipLabel ?? d.label, view, lines: rows, total: rows.length, tokenWidth, approximate };
}

/** Chrome lets a line run one LayoutUnit (1/64px) past the column before it breaks. */
const EPSILON = 1 / 64;

/** A piece's graphemes, with a default ligature (the bird) kept as one cell where it forms. */
function clusters(text: string, style: RunStyle): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest) {
    const lig = style.letterSpacing === 0 ? ligatureIn(rest, style) : null;
    const head = lig ? rest.slice(0, lig.at) : rest;
    for (const { segment } of graphemes.segment(head)) out.push(segment);
    if (!lig) break;
    out.push(lig.text);
    rest = rest.slice(lig.at + lig.text.length);
  }
  return out;
}

/** An item's width as Chrome's line breaker counts it: rounded up to the next LayoutUnit. */
function snap(w: number): number {
  return Math.ceil(w * 64 - 1e-7) / 64;
}

/**
 * One row: each [data-w] fragment on it with its offsets and pixel edges. A span that wraps (a link
 * broken after "/" on the app pane, a word after a hyphen, CJK) gives one fragment per row; every one
 * after the first is `cont`, a token's tail rather than a word the writer can move.
 */
function rowOf(cells: Cell[], pieces: Piece[], firstRowOf: Map<number, number>, rowIndex: number): LineInfo {
  const row: LineInfo = { words: [], paragraph: -1, end: 0, spans: [] };
  // Edges as Chrome places them: each item starts where the snapped widths of the ones before it end.
  let done = 0;
  let cur = 0;
  let curItem = -1;
  const advance = (cell: Cell) => {
    if (cell.item !== curItem) {
      done += snap(cur);
      cur = 0;
      curItem = cell.item;
    }
    cur += cell.width;
  };
  const at = () => done + snap(cur);
  // A row that ends inside a word (no hanging space) was reshaped there: its last cell drops the kerning
  // with the first cell of the next row.
  const lastCell = cells[cells.length - 1];
  const trimmed = lastCell && !lastCell.space && lastCell.kernNext ? cells.map((c) => (c === lastCell ? { ...c, width: c.width - (c.kernNext ?? 0) } : c)) : cells;
  cells = trimmed;
  let k = 0;
  while (k < cells.length) {
    const c = cells[k];
    if (c.piece < 0) {
      advance(c);
      k++;
      continue;
    }
    const p = pieces[c.piece];
    if (c.item !== curItem) {
      done += snap(cur);
      cur = 0;
      curItem = c.item;
    }
    const left = at();
    let text = "";
    let m = k;
    for (; m < cells.length && cells[m].piece === c.piece; m++) {
      text += cells[m].text;
      advance(cells[m]);
    }
    const x = at();
    const first = !firstRowOf.has(c.piece);
    if (first) firstRowOf.set(c.piece, rowIndex);
    // Whether the piece ends on this row, or runs on to the next one.
    const ends = Boolean(cells[m - 1].last);
    const cont = first ? {} : { cont: true };
    if (first && ends) {
      row.spans.push({ start: p.link ?? p.end - p.text.length, end: p.end, left, right: x, ...(p.link !== undefined ? { link: true } : {}) });
      row.end = p.end;
    } else if (p.link === undefined) {
      row.spans.push({ start: c.end - c.text.length, end: cells[m - 1].end, left, right: x, ...cont });
      row.end = cells[m - 1].end;
    } else if (ends) {
      // A link is one unit for the fold: only the row it ends on can cut after it. A row it runs off ends
      // at the link's start (below), so a fold there keeps the whole link behind Show more (an empty span
      // gives no cut inside it, and the fold still eats a character from the text before it). Assumed:
      // no capture has a link across the fold.
      row.spans.push({ start: p.link, end: p.end, left, right: x, link: true, ...cont });
      row.end = p.end;
    } else {
      row.spans.push({ start: p.link, end: p.link, left, right: left, ...cont });
      row.end = p.link;
    }
    row.words.push(text);
    row.paragraph = p.paragraph;
    k = m;
  }
  return row;
}

/**
 * The lines a reader sees before any Show more tap, as text: each row's words as drawn (a link as its
 * display text, a wrapped token as its fragment) with the post's own characters between them, up to the
 * fold. A word is cut through at the fold, while a link that runs past it goes behind Show more whole
 * (see rowOf). Blank rows are paragraph gaps ("").
 */
export function visibleLines(post: string, set: DeviceLines, fold: { cut: number; showMore: boolean }): string[] {
  const cut = fold.showMore ? fold.cut : Infinity;
  const rows = set.lines;
  // The last row holding text before the cut. A row past it can only be the web's Show more token
  // wrapped onto a line of its own, which a post that shows whole never draws (a post is trimmed, so it
  // never ends in a paragraph gap).
  const last = rows.reduce((n, l, i) => (l.spans.some((s) => s.start < cut) ? i : n), -1);
  return rows.slice(0, last + 1).map((line) => {
    let out = "";
    line.spans.forEach((s, i) => {
      if (s.link ? s.end > cut : s.start >= cut) return;
      const word = !s.link && s.end > cut ? line.words[i].slice(0, cut - s.start) : line.words[i];
      out += (i ? post.slice(line.spans[i - 1].end, s.start) : "") + word;
    });
    return out.trimEnd();
  });
}
