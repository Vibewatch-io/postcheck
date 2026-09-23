#!/usr/bin/env node
// Which app font file and column width reproduce the phone captures?
// Runs the CoreText oracle over every fixtures/app post for each candidate
// and prints how many posts match line-for-line (fold line excluded).
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const norm = (s) => s.replace(/\u2060/g, "").replace(/\s+([.,!?:;'’])/g, "$1").replace(/\s+/g, " ").trim();
/** The text as the app draws it: links as their display text, media links dropped, with link/mention runs. */
function drawnText(f) {
  const cps = [...f.text];
  const edits = [...(f.entities?.urls ?? []).map((u) => ({ i: u.indices, r: u.display_url, link: true })), ...(f.entities?.media ?? []).map((m) => ({ i: m.indices, r: "", link: false }))].sort((a, b) => a.i[0] - b.i[0]);
  let out = "", cur = 0; const runs = [];
  for (const e of edits) { out += cps.slice(cur, e.i[0]).join(""); if (e.link) runs.push([out.length, e.r.length]); out += e.r; cur = e.i[1]; }
  out = (out + cps.slice(cur).join("")).trimEnd();
  for (const m of out.matchAll(/@\w{1,15}/g)) runs.push([m.index, m[0].length]);
  // X hides a trailing card link in the app; the captures never show it.
  const last = runs.find(([st, l]) => st + l === out.length && !out.slice(st).startsWith("@"));
  if (last) { out = out.slice(0, last[0]).trimEnd(); }
  const kept = runs.filter((r) => r !== last && r[0] < out.length);
  // The app never breaks a hyphenated word at its hyphen; a word joiner after each in-word hyphen reproduces that.
  const joined = out.replace(/(\p{L}|\p{N})-(\p{L}|\p{N})/gu, "$1-\u2060$2");
  const wjBefore = (i) => (out.slice(0, i).replace(/(\p{L}|\p{N})-(\p{L}|\p{N})/gu, "$1-\u2060$2").length - i);
  return { t: joined, e: kept.map(([st, l]) => { const a = wjBefore(st); const b = wjBefore(st + l); return [st + a, l + (b - a)]; }) };
}
const fixtures = readdirSync("fixtures/app").map((f) => JSON.parse(readFileSync(`fixtures/app/${f}`, "utf8")));
const posts = fixtures.flatMap((fx) => fx.posts).map((p) => {
  const fx = JSON.parse(readFileSync(`fixtures/posts/${p.id}.json`, "utf8"));
  const drawn = drawnText(fx);
  const expect = p.showMore ? p.lines.slice(0, -1) : p.lines;
  return { id: p.id, text: drawn, expect: expect.map(norm), showMore: p.showMore };
});
const fonts = process.env.FONTS ? process.env.FONTS.split(",") : ["Chirp-Regular.otf", "Chirp-UI-VF.ttf", "Chirp-UI-VF-With-Overriden-Emoji.ttf", "Chirp-UI-VF-With-Overriden-Emoji-202601.ttf"];
const [w0, w1, step] = (process.env.WIDTHS || "312,333,1").split(",").map(Number);
const widths = []; for (let w = w0; w <= w1 + 1e-9; w += step) widths.push(Math.round(w * 100) / 100);
const sizes = (process.env.SIZES || "15").split(",").map(Number);
const showDiff = process.env.DIFF === "1";
const texts = JSON.stringify(posts.map((p) => p.text));
const results = [];
for (const font of fonts) for (const size of sizes) for (const width of widths) {
  const args = [`.fonts/app/${font}`, String(size), String(width)];
  if (font.includes("VF")) args.push(process.env.AXES || "2003265652=400");
  const lines = JSON.parse(execFileSync("scripts/ios/layout", args, { input: texts }).toString());
  let ok = 0; const bad = []; const diffs = [];
  posts.forEach((p, i) => {
    const got = lines[i].map(norm).slice(0, p.expect.length);
    if (p.expect.every((l, k) => l === got[k])) ok++; else { bad.push(p.id); const k = p.expect.findIndex((l, j) => l !== got[j]); diffs.push(`${p.id} line ${k + 1}\n      phone: ${p.expect[k]}\n      oracle: ${got[k]}`); }
  });
  results.push({ font, size, width, ok, bad, diffs });
}
results.sort((a, b) => b.ok - a.ok);
for (const r of results.slice(0, 12)) { console.log(`${String(r.ok).padStart(2)}/${posts.length}  ${r.font.padEnd(44)} ${r.size}pt ${r.width}px${r.bad.length ? "  miss: " + r.bad.join(" ") : ""}`); if (showDiff && r === results[0]) for (const d of r.diffs) console.log("    " + d); }
