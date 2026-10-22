#!/usr/bin/env node
// Recapture the Android timeline lines of every post in an app fixture, on the USB phone.
// Usage (after `scripts/android/android.sh dp 360` or `dp 412`, phone unlocked, X signed in as @Postcheck_test):
//   node scripts/android/recapture.mjs <fixtures/app/galaxy-s25.json|pixel-10.json> <out.json> [id ...]
// For each post: open its status link, which puts it at the top of Home as an ordinary timeline cell
// (searching ~300 times in a day got the account "Oops, something went wrong" on 2026-10-21; `--search`
// uses search cells instead), find its body node in the uiautomator dump (the app's own characters), screenshot it, and split those characters where macOS Vision OCR
// (ocr.swift) puts the row breaks. Writes { id: { lines, showMore, bounds, flags } } and keeps the
// screenshots in .captures/android-pixel3/<today>-recapture/ (UTC date). A flagged post needs a look by eye. Navigation only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const bySearch = args.includes("--search");
const [fixturePath, outPath, ...only] = args.filter((a) => a !== "--search");
if (!fixturePath || !outPath) { console.error("usage: recapture.mjs <fixture> <out.json> [id ...]"); process.exit(2); }
const here = new URL(".", import.meta.url).pathname;
const android = join(here, "android.sh");
const day = new Date().toISOString().slice(0, 10);
const capDir = join(here, "..", "..", ".captures", "android-pixel3", `${day}-recapture`);
mkdirSync(capDir, { recursive: true });

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
const sh = (...a) => execFileSync(android, a, { encoding: "utf8" });
const adb = (...a) => execFileSync("adb", a, { encoding: "utf8", maxBuffer: 1 << 26 });
const nfc = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const compact = (s) => s.replace(/\s+/g, "");

/** Every text node in the current screen, with its bounds. */
function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/u.xml");
  const xml = adb("shell", "cat", "/sdcard/u.xml");
  const nodes = [];
  for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    const text = m[1].replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    nodes.push({ text, bounds: [+m[2], +m[3], +m[4], +m[5]] });
  }
  return { xml, nodes };
}

/** Back out of sheets X puts over the screen (an update offer, a Boost upsell). Never taps them. */
function clearSheets() {
  for (let i = 0; i < 2; i++) {
    const { xml } = dump();
    if (/Update available|Maybe Later|A new version is ready/.test(xml)) sh("back"); else return;
  }
}

/** Search words: the start of X's stored text, up to the first link or handle, letters and digits only. */
function query(p) {
  const words = [];
  const posted = join(here, "..", "..", "fixtures", "posts", `${p.id}.json`);
  const text = existsSync(posted) ? JSON.parse(readFileSync(posted, "utf8")).text : p.lines.join(" ");
  for (const w of text.split(/\s+/)) {
    if (words.length >= 4) break;
    // Skip links, handles, tags and tickers rather than stop at them: some posts start with one.
    if (/^https?:|^[.@#$]|\w\.\w|@/.test(w)) { if (words.length) break; continue; }
    // Punctuation inside a word ("4:1", "1/3", "bitcoin:native") doesn't survive search: stop before it.
    const core = w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    if (/[^\p{L}\p{M}\p{N}'-]/u.test(core)) { if (words.length) break; continue; }
    if (core) words.push(core);
  }
  // An emoji-only post: search for its first emoji.
  if (!words.length) return [...text.trim()][0] ?? "";
  return words.join(" ");
}

/** Similarity of two strings, 0..1 (Levenshtein on compacted text). */
function ratio(a, b) {
  a = compact(a); b = compact(b);
  if (!a.length && !b.length) return 1;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return 1 - d[b.length] / Math.max(a.length, b.length);
}

/**
 * Split the node's text into the OCR's rows: each row takes the run of pieces whose length best matches
 * it. Pieces are words, with links cut after each "/" (the app breaks a link there); a piece longer than
 * its row is broken at the row's length (the app breaks an over-long word at the last character that fits).
 */
function split(text, rows) {
  const paras = text.split("\n");
  const lines = [];
  let r = 0;
  const flags = [];
  for (const para of paras) {
    // Each piece keeps the spaces typed before it (X keeps repeated spaces inside a line).
    const words = [];
    for (const m of para.matchAll(/( *)(\S+)/g)) m[2].split(/(?<=\/)(?=.)/).forEach((piece, j) => words.push({ t: piece, sp: j === 0 ? m[1] : "" }));
    if (!words.length) { lines.push(""); continue; }
    const join = (ws) => ws.map((w, j) => (j ? w.sp : "") + w.t).join("");
    let i = 0;
    while (i < words.length) {
      const row = rows[r++];
      if (!row) { flags.push("ran out of OCR rows"); lines.push(join(words.slice(i))); break; }
      const want = [...compact(row.text)].length; // code points, like the words below
      let best = i + 1, bestErr = Infinity, len = 0;
      for (let k = i; k < words.length; k++) {
        len += [...words[k].t].length;
        const err = Math.abs(len - want);
        if (err < bestErr) { bestErr = err; best = k + 1; }
        if (len > want + 8) break;
      }
      const first = [...words[i].t];
      if (best === i + 1 && first.length > want + 2 && want > 0) {
        words.splice(i, 1, { t: first.slice(0, want).join(""), sp: words[i].sp }, { t: first.slice(want).join(""), sp: "" });
        flags.push(`broke "${first.join("")}" after ${want} characters`);
      }
      const line = join(words.slice(i, best)).trimStart();
      const score = ratio(line, row.text);
      if (score < 0.75) flags.push(`row ${lines.length + 1} reads "${row.text}" for "${line}" (${score.toFixed(2)})`);
      lines.push(line);
      i = best;
    }
  }
  if (r < rows.length) flags.push(`${rows.length - r} OCR rows left over`);
  return { lines, flags };
}

const posts = fixture.posts.filter((p) => !only.length || only.includes(p.id));
for (const p of posts) {
  const q = query(p);
  const flags = [];
  sh("open", bySearch ? `https://x.com/search?q=${encodeURIComponent(`"${q}" from:Postcheck_test`)}&f=live` : `https://x.com/Postcheck_test/status/${p.id}`, "6");
  clearSheets();
  const want = nfc(p.lines.join(" "));
  const find = () => dump().nodes.filter((n) => n.text && n.bounds[0] > 100 && ratio(nfc(n.text).slice(0, 40), want.slice(0, 40)) > 0.6);
  let cands = find();
  // Search results can take a few seconds more: look again before giving up.
  for (let t = 0; t < 3 && !cands.length; t++) { execFileSync("sleep", ["3"]); clearSheets(); cands = find(); }
  if (!cands.length) {
    // Keep the screen for a look by eye (some posts' text node is empty, and X auto-translates some).
    sh("cap", "_recap"); execFileSync("mv", [join(here, "_recap.png"), join(capDir, `${p.id}-nomatch.png`)]);
    // A rerun that misses keeps an earlier capture: it only adds the flag.
    out[p.id] = out[p.id]?.lines ? { ...out[p.id], flags: [...(out[p.id].flags ?? []), "no matching body node on a rerun"] } : { query: q, flags: ["no matching body node"] }; console.log(p.id, "nomatch", q); writeFileSync(outPath, JSON.stringify(out, null, 1)); continue;
  }
  cands.sort((a, b) => ratio(nfc(b.text), want) - ratio(nfc(a.text), want));
  const node = cands[0];
  if (cands.length > 1) flags.push(`${cands.length} candidate cells`);
  const shot = join(capDir, `${p.id}.png`);
  sh("cap", "_recap");
  execFileSync("mv", [join(here, "_recap.png"), shot]);
  const [x1, y1, x2, y2] = node.bounds;
  if (y2 >= 2000) flags.push("cell runs off the screen");
  const rows = JSON.parse(execFileSync("swift", [join(here, "ocr.swift"), shot, String(x1), String(y1), String(x2 - x1), String(y2 - y1)], { encoding: "utf8" }));
  let text = node.text;
  const showMore = /\sShow more$/.test(text);
  if (showMore) {
    text = text.replace(/\s*Show more$/, "");
    // The token can wrap like two words ("…dog Show" | "more"): drop a last row that only says "more" (OCR may read "mre").
    if (rows.length && compact(rows[rows.length - 1].text).length <= 5 && ratio(rows[rows.length - 1].text, "more") >= 0.5) rows.pop();
    const last = rows[rows.length - 1];
    if (last) { last.text = last.text.replace(/\s*Show(\s*m\w*)?\.*$/, ""); if (!last.text.trim()) rows.pop(); }
  }
  // OCR misreads emoji, RTL scripts and runs of spaces. Where its rows start and end on the same words
  // as the earlier transcription, row for row (blank lines aside), that transcription still holds: keep it.
  // A rewrap always changes some row's first or last word.
  const edge = (s, last) => { const w = s.match(/[\p{L}\p{N}]+/gu) ?? [""]; return last ? w[w.length - 1] : w[0]; };
  const before = p.lines.filter((l) => l !== "");
  const agrees = showMore === p.showMore && before.length === rows.length &&
    before.every((l, i) => ratio(edge(l, false), edge(rows[i].text, false)) >= 0.6 && ratio(edge(l, true), edge(rows[i].text, true)) >= 0.6);
  const s = agrees ? { lines: p.lines, flags: [] } : split(text, rows);
  out[p.id] = { query: q, lines: s.lines, showMore, bounds: node.bounds, kept: agrees, text: node.text, rows: rows.map((r) => r.text), flags: [...flags, ...s.flags] };
  const same = JSON.stringify(s.lines) === JSON.stringify(p.lines) && showMore === p.showMore;
  console.log(p.id, same ? "same" : "CHANGED", out[p.id].flags.length ? `flags: ${out[p.id].flags.join("; ")}` : "");
  writeFileSync(outPath, JSON.stringify(out, null, 1));
}
