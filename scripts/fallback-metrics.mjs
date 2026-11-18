#!/usr/bin/env node
// Regenerate src/lib/layout/fallback-metrics.json: the widths of characters X's Chirp doesn't have, as
// the preview draws them (Chrome on macOS, the preview's own font stack from src/lib/theme.ts), in px at
// each body size the devices use (15, 16, 17). They don't scale: Apple Color Emoji is 19px wide at 15px
// and 21px at 17px, and Han glyphs round differently at each size.
// The layout engine uses them for emoji, CJK, Hebrew, Arabic, Devanagari, Thai and the rest, and calls
// any line that holds one approximate: a reader's phone draws these in its own system fonts.
//
//   node scripts/fallback-metrics.mjs        (macOS: the fallbacks are Apple's system fonts)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

if (platform() !== "darwin") {
  console.error("Run this on macOS: the widths are those of the fonts the preview falls back to there.");
  process.exit(2);
}
// Paths from this file, so the script works from any directory.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}src/lib/layout/fallback-metrics.json`;
// Blocks that come up in posts and that Chirp leaves to fallback fonts. The engine binary-searches the
// table, so the runs must come out in code-point order: the list is sorted below and checked at the end.
const RANGES = [
  [0x0370, 0x03ff], [0x0400, 0x052f], // Greek, Cyrillic (whatever Chirp lacks)
  [0x0590, 0x05ff], [0x0600, 0x06ff], [0x0750, 0x077f], // Hebrew, Arabic
  [0x0900, 0x097f], [0x0980, 0x09ff], [0x0e00, 0x0e7f], // Devanagari, Bengali, Thai
  [0x0e80, 0x0eff], [0x1000, 0x109f], [0x1780, 0x17ff], // Lao, Myanmar, Khmer
  [0x1100, 0x11ff], [0x2000, 0x2bff], // Hangul Jamo, punctuation, symbols, arrows, dingbats
  [0x3000, 0x30ff], [0x3130, 0x318f], [0x3400, 0x4dbf], [0x4e00, 0x9fff], // CJK punctuation, kana, Han
  [0xac00, 0xd7a3], [0xff00, 0xffef], // Hangul syllables, fullwidth forms
  [0x1d400, 0x1d7ff], // mathematical alphanumerics (the "Unicode bold" X posts use)
].sort((a, b) => a[0] - b[0]);
// The preview's stack (theme.ts), GT America included: the site serves it, so a character Chirp lacks
// and GT America has is drawn in GT America there. Its files are licensed to Vibewatch and never in the
// repo; the script reads the local copy (.fonts/gt-america) and serves it only to its own headless page.
const STACK = 'TwitterChirpWeb, TwitterChirp, GTAmerica, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const GT = `${ROOT}.fonts/gt-america/GT-America-Standard-Regular.woff2`;
if (!existsSync(GT)) {
  console.error(`Needs ${GT} (the licensed GT America files) so the fallback order matches the site's.`);
  process.exit(2);
}
// Only Han and Hangul: the big blocks that alternate between two system fonts glyph by glyph.
const ONE_WIDTH = [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xac00, 0xd7a3]];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("https://fonts.invalid/gt-regular.woff2", (route) => route.fulfill({ body: readFileSync(GT), contentType: "font/woff2", headers: { "access-control-allow-origin": "*" } }));
await page.setContent(`<style>
@font-face{font-family:GTAmerica;src:url("https://fonts.invalid/gt-regular.woff2") format("woff2")}
@font-face{font-family:TwitterChirpWeb;src:url("https://abs.twimg.com/responsive-web/client-web/Chirp-Regular.80fda27a.woff2") format("woff2")}
@font-face{font-family:TwitterChirp;src:url("https://abs.twimg.com/fonts/v2/chirp-regular-web.woff2") format("woff2")}
body{font-family:${STACK};white-space:pre}</style>`);
await page.evaluate(() => Promise.all([document.fonts.load("15px TwitterChirpWeb"), document.fonts.load("15px TwitterChirp"), document.fonts.load("15px GTAmerica")]));
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
    if (ONE_WIDTH.some(([a, b]) => a === from && b === to)) {
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
  if (runs.some((r, i) => i > 0 && r[0] <= runs[i - 1][1])) throw new Error(`runs at ${size}px are out of order`);
  sizes[size] = { emoji: emoji[0], runs };
  console.log(`${size}px: ${runs.length} runs, emoji ${emoji[0] / 64}px`);
}
await browser.close();
const out = { _note: "Fallback-font widths in 1/64px at each body size, measured in Chrome on macOS with the preview's font stack; regenerate with scripts/fallback-metrics.mjs.", sizes };
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT}`);
