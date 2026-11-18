#!/usr/bin/env node
// Regenerate src/lib/layout/fallback-metrics.json: the widths of characters X's Chirp doesn't have, as
// the preview draws them (Chrome on macOS, the preview's own font stack from src/lib/theme.ts), in px at
// each body size the devices use (15, 16, 17). They don't scale: Apple Color Emoji is 19px wide at 15px
// and 21px at 17px, and Han glyphs round differently at each size.
// The layout engine uses them for emoji, CJK, Hebrew, Arabic, Devanagari, Thai and the rest, and calls
// any line that holds one approximate: a reader's phone draws these in its own system fonts.
//
//   node scripts/fallback-metrics.mjs        (macOS: the fallbacks are Apple's system fonts)
import { writeFileSync } from "node:fs";
import { platform } from "node:os";
import { chromium } from "playwright";

if (platform() !== "darwin") {
  console.error("Run this on macOS: the widths are those of the fonts the preview falls back to there.");
  process.exit(2);
}
const OUT = "src/lib/layout/fallback-metrics.json";
// Blocks that come up in posts and that Chirp leaves to fallback fonts.
const RANGES = [
  [0x0370, 0x03ff], [0x0400, 0x052f], // Greek, Cyrillic (whatever Chirp lacks)
  [0x0590, 0x05ff], [0x0600, 0x06ff], [0x0750, 0x077f], // Hebrew, Arabic
  [0x0900, 0x097f], [0x0980, 0x09ff], [0x0e00, 0x0e7f], // Devanagari, Bengali, Thai
  [0x1100, 0x11ff], [0x2000, 0x2bff], // Hangul Jamo, punctuation, symbols, arrows, dingbats
  [0x3000, 0x30ff], [0x3130, 0x318f], [0x3400, 0x4dbf], [0x4e00, 0x9fff], // CJK punctuation, kana, Han
  [0xac00, 0xd7a3], [0xff00, 0xffef], // Hangul syllables, fullwidth forms
  [0x1d400, 0x1d7ff], // mathematical alphanumerics (the "Unicode bold" X posts use)
];
const STACK = 'TwitterChirpWeb, TwitterChirp, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<style>
@font-face{font-family:TwitterChirpWeb;src:url("https://abs.twimg.com/responsive-web/client-web/Chirp-Regular.80fda27a.woff2") format("woff2")}
@font-face{font-family:TwitterChirp;src:url("https://abs.twimg.com/fonts/v2/chirp-regular-web.woff2") format("woff2")}
body{font-family:${STACK};white-space:pre}</style>`);
await page.evaluate(() => Promise.all([document.fonts.load("15px TwitterChirpWeb"), document.fonts.load("15px TwitterChirp")]));
const SIZES = [15, 16, 17];
const sizes = {};
for (const size of SIZES) {
  const runs = [];
  for (const [from, to] of RANGES) {
    const widths = await page.evaluate(([from, to, size]) => {
      const s = document.createElement("span");
      s.style.fontSize = `${size}px`;
      document.body.appendChild(s);
      const out = [];
      for (let cp = from; cp <= to; cp++) {
        s.textContent = String.fromCodePoint(cp);
        // Chrome reports widths in LayoutUnits (1/64px): stored as that integer.
        out.push(Math.round(s.getBoundingClientRect().width * 64));
      }
      s.remove();
      return out;
    }, [from, to, size]);
    // The big ideograph and syllable blocks alternate between two system fonts glyph by glyph (Han is
    // 15 or 15.3125px at 15px): one width per block, the commonest, keeps the table small. These scripts
    // are approximate anyway.
    if (to - from > 2000) {
      const counts = new Map();
      for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
      const mode = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      widths.fill(mode);
    }
    // Run-length: [first code point, last, width in 1/64px].
    widths.forEach((w, i) => {
      const cp = from + i;
      const last = runs[runs.length - 1];
      if (last && last[1] === cp - 1 && last[2] === w) last[1] = cp;
      else runs.push([cp, cp, w]);
    });
  }
  // Every emoji cluster draws at one advance per size; check a few kinds agree.
  const emoji = await page.evaluate((size) => ["🐝", "👍🏽", "🇺🇸", "👨‍👩‍👧‍👦", "✨"].map((t) => {
    const s = document.createElement("span");
    s.style.fontSize = `${size}px`;
    s.textContent = t;
    document.body.appendChild(s);
    const w = Math.round(s.getBoundingClientRect().width * 64);
    s.remove();
    return w;
  }), size);
  if (new Set(emoji).size !== 1) throw new Error(`emoji widths differ at ${size}px: ${emoji}`);
  sizes[size] = { emoji: emoji[0], runs };
  console.log(`${size}px: ${runs.length} runs, emoji ${emoji[0] / 64}px`);
}
await browser.close();
const out = { _note: "Fallback-font widths in 1/64px at each body size, measured in Chrome on macOS with the preview's font stack; regenerate with scripts/fallback-metrics.mjs.", sizes };
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT}`);
