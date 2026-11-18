/**
 * The "within font tolerance" test shared by verify.mjs (the browser preview) and tests/layout.test.ts (the
 * layout engine): which line misses a font's sub-pixel widths can explain.
 */

/** Break opportunities inside a word, as the engine finds them: after a hyphen or dash, a link's "/", "?" and "…". */
const BREAK_AFTER = /[-‐‒–—/?…]$/u;
const BREAK_INSIDE = /[-‐‒–—/?…](?=.)/u;
/** Scripts written without spaces: lines break between words that each platform finds with its own dictionary. */
const UNSPACED = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const words = new Intl.Segmenter(undefined, { granularity: "word" });

/** One unit a line can't break inside: no space, no break opportunity, and in an unspaced script one dictionary word. */
function oneUnit(unit: string): boolean {
  if (!unit || /\s/.test(unit) || BREAK_INSIDE.test(unit)) return false;
  return !UNSPACED.test(unit) || [...words.segment(unit)].filter((s) => s.isWordLike).length <= 1;
}

/**
 * How the wrap moved between two versions of one line (normalised, the same text up to where the shorter ends):
 * by one word, the next unit up to a break opportunity run on or pushed down ("word"); by at most two
 * characters inside a word with nowhere to break, where break-word or an app's fold cuts it ("chars"); or by
 * more (null). Only the first two are a font coin flip: a run with no break opportunity ends at the column
 * however many characters it gains, so a line can sit at the edge and still miss by ten (160 periods on the
 * iPhone: X 84 a line, the tool 94). In Thai, CJK and the like a word ends wherever the reader's dictionary
 * says, so a move of one dictionary word between two such characters counts as a word.
 */
export function wrapMove(a: string, b: string): "word" | "chars" | null {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer === shorter || !longer.startsWith(shorter)) return null;
  const moved = longer.slice(shorter.length);
  const unit = moved.trim();
  const atBreak = /^\s/.test(moved) || BREAK_AFTER.test(shorter) || (UNSPACED.test(shorter.slice(-1)) && UNSPACED.test(moved[0]));
  if (atBreak && oneUnit(unit)) return "word";
  if (!/\s/.test(moved) && !BREAK_INSIDE.test(moved) && moved.length <= 2) return "chars";
  return null;
}
