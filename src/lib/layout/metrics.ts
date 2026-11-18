/**
 * Text widths from X's Chirp, measured the way Chrome measures them: each character's advance, the
 * font's `kern` pair adjustment between neighbours, the default-on substitutions that change a width
 * (`ccmp` decompositions; the `calt` bird ligature where no letter-spacing turns it off), and CSS
 * letter-spacing after every character. The numbers come from X's own font files
 * (chirp-metrics.json, written by scripts/chirp-metrics.py): x.com's build for the web views and
 * Android, `fonts/v2` for the iOS app, as src/app/globals.css loads them. Checked against the browser:
 * the reference line verify.mjs measures comes out at 320.3px (web) and 313.0px (app), as Chrome draws it.
 *
 * Characters Chirp doesn't have are drawn by whatever font the reader's device falls back to, so their
 * widths can only be estimated: here they take the widths the preview's fallbacks give them in Chrome on
 * macOS at each body size (fallback-metrics.json, written by scripts/fallback-metrics.mjs), and the
 * measurement says it is approximate.
 */
import table from "./chirp-metrics.json";
import fallbackTable from "./fallback-metrics.json";

export type FontKey = "web-400" | "web-700" | "app-400" | "app-700";

interface RawFace {
  upm: number;
  chars: string;
  adv: number[];
  kern: { left: string[]; right: string[]; values: Array<Array<[number, number]>> };
  decompose: Record<string, string>;
  ligatures: Array<{ text: string; adv: number }>;
}

interface Face {
  upm: number;
  adv: Map<number, number>;
  left: Map<number, number>;
  right: Map<number, number>;
  values: Array<Map<number, number>>;
  decompose: Map<number, number[]>;
  ligatures: Array<{ cps: number[]; adv: number }>;
}

const faces = new Map<FontKey, Face>();

function face(key: FontKey): Face {
  let f = faces.get(key);
  if (f) return f;
  const raw = (table as unknown as { fonts: Record<FontKey, RawFace> }).fonts[key];
  const cps = (s: string) => Array.from(s, (c) => c.codePointAt(0)!);
  const classes = (groups: string[]) => new Map(groups.flatMap((g, i) => cps(g).map((cp) => [cp, i] as [number, number])));
  f = {
    upm: raw.upm,
    adv: new Map(cps(raw.chars).map((cp, i) => [cp, raw.adv[i]])),
    left: classes(raw.kern.left),
    right: classes(raw.kern.right),
    values: raw.kern.values.map((row) => new Map(row)),
    decompose: new Map(Object.entries(raw.decompose).map(([k, v]) => [k.codePointAt(0)!, cps(v)])),
    ligatures: raw.ligatures.map((l) => ({ cps: cps(l.text), adv: l.adv })),
  };
  faces.set(key, f);
  return f;
}

/** The two faces a pane's font stack tries before the system fonts (globals.css, theme.ts). */
const STACK: Record<"web" | "app", Array<"web" | "app">> = { web: ["web", "app"], app: ["app"] };

export function hasGlyph(font: "web" | "app", cp: number): boolean {
  return STACK[font].some((k) => face(`${k}-400`).adv.has(cp));
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
/** Joiners and selectors that ride on the character before them and take no width of their own. */
const ZERO = /[\u200b-\u200d\u2060\ufe00-\ufe0f\u{e0020}-\u{e007f}\u{1f3fb}-\u{1f3ff}]|\p{M}/u;

type FallbackSize = { emoji: number; runs: Array<[number, number, number]> };
const fallback = (fallbackTable as unknown as { sizes: Record<string, FallbackSize> }).sizes;
/** A character outside every measured block: about an average Latin letter. */
const OTHER_EM = 0.6;

/**
 * A fallback cluster's width in px at `size`: an emoji cluster draws at one advance whatever it holds.
 * Sizes not measured (none of the devices) scale from 15px.
 */
function fallbackWidth(cluster: string, cp: number, size: number): number {
  const table = fallback[String(size)];
  const scale = table ? 1 : size / 15;
  const t = table ?? fallback["15"];
  if (EMOJI.test(cluster)) return (t.emoji / 64) * scale;
  let lo = 0;
  let hi = t.runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < t.runs[mid][0]) hi = mid - 1;
    else if (cp > t.runs[mid][1]) lo = mid + 1;
    else return (t.runs[mid][2] / 64) * scale;
  }
  return OTHER_EM * size;
}

export interface RunStyle {
  font: "web" | "app";
  bold: boolean;
  /** px */
  size: number;
  /** px added after every character (CSS letter-spacing). */
  letterSpacing: number;
}

export interface Measured {
  width: number;
  /** Some characters were drawn by a fallback font: the width is an estimate. */
  approximate: boolean;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Width of `text` set in one style, in px. Kerning applies between neighbours set in the same Chirp
 * face; a character from another face or a fallback font breaks the run, as it does in the browser.
 */
export function measure(text: string, style: RunStyle): Measured {
  // The `calt` ligature (the literal "[CHIRPBIRDICON]" becomes X's bird) is one glyph. Chrome turns
  // ligatures off under letter-spacing, so the iOS pane sets the characters one by one (measured in
  // Chrome: 17.19px at 0, 122.63px at -0.18px).
  if (style.letterSpacing === 0) {
    const lig = ligatureIn(text, style);
    if (lig) {
      const before = measure(text.slice(0, lig.at), style);
      const after = measure(text.slice(lig.at + lig.text.length), style);
      return { width: before.width + lig.width + after.width, approximate: before.approximate || after.approximate };
    }
  }
  let width = 0;
  let approximate = false;
  let prev: { key: FontKey; cp: number } | null = null;
  const weight = style.bold ? 700 : 400;
  for (const { segment } of graphemes.segment(text)) {
    const cps = Array.from(segment, (c) => c.codePointAt(0)!);
    const base = cps[0];
    const owner = STACK[style.font].find((k) => face(`${k}-400`).adv.has(base));
    if (!owner) {
      prev = null;
      if (ZERO.test(segment) && cps.every((cp) => ZERO.test(String.fromCodePoint(cp)))) continue;
      width += fallbackWidth(segment, base, style.size) + style.letterSpacing;
      approximate = true;
      continue;
    }
    const key: FontKey = `${owner}-${weight}`;
    const f = face(key);
    // A cluster is the base character and any marks riding on it (zero width in Chirp, see the generator).
    for (const cp of f.decompose.get(base) ?? [base]) {
      const adv = f.adv.get(cp) ?? f.adv.get(base) ?? 0;
      if (prev && prev.key === key) width += kernOf(f, prev.cp, cp) * style.size / f.upm;
      width += adv * style.size / f.upm;
      prev = { key, cp };
    }
    width += style.letterSpacing;
  }
  return { width, approximate };
}

/** The first default ligature in `text` for this style: where it starts, its text and its width. */
export function ligatureIn(text: string, style: RunStyle): { at: number; text: string; width: number } | null {
  const f = face(`${STACK[style.font][0]}-${style.bold ? 700 : 400}`);
  let best: { at: number; text: string; width: number } | null = null;
  for (const l of f.ligatures) {
    const s = String.fromCodePoint(...l.cps);
    const at = text.indexOf(s);
    if (at >= 0 && (!best || at < best.at)) best = { at, text: s, width: (l.adv * style.size) / f.upm };
  }
  return best;
}

function kernOf(f: Face, a: number, b: number): number {
  const l = f.left.get(a);
  const r = f.right.get(b);
  return l === undefined || r === undefined ? 0 : (f.values[l].get(r) ?? 0);
}

/** Kerning in px between the last character of one run and the first of the next, when both are in the same face. */
export function kernBetween(a: string, b: string, style: RunStyle): number {
  const ca = Array.from(a).pop()?.codePointAt(0);
  const cb = b.codePointAt(0);
  if (ca === undefined || cb === undefined) return 0;
  const owner = (cp: number) => STACK[style.font].find((k) => face(`${k}-400`).adv.has(cp));
  const oa = owner(ca);
  if (!oa || oa !== owner(cb)) return 0;
  const f = face(`${oa}-${style.bold ? 700 : 400}`);
  return (kernOf(f, ca, cb) * style.size) / f.upm;
}
