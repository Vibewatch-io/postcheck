#!/usr/bin/env node
// Rapid test → verify: renders every captured post in the tool (headless
// Chromium) and diffs its line breaks and fold against what X actually
// rendered — fixtures/web/*.json (x.com DOM captures) and fixtures/app/*.json
// (iPhone captures). Usage: node scripts/verify.mjs [--port 3100] [--keep]
import { readdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

import { createServer } from "node:net";
const args = process.argv.slice(2);
// Always serve the current build on a free port; a stale server from an earlier run must never be reused.
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : await new Promise((r) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const base = `http://localhost:${port}`;

// Captures and the tool's row walk both split tokens at entity boundaries, so "(" + link + ")." can come back
// with spaces around the link; app transcriptions keep the real spacing. Compare with bracket/quote spacing removed.
const norm = (s) => s.replace(/\s+([.,!?:;'’)\]"”…])/g, "$1").replace(/([(\["“])\s+/g, "$1").replace(/^\.\s+@/, ".@").replace(/\s+/g, " ").trim();
const isUrlLine = (s) => /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,}\S*\/?…?$)/i.test(s.trim());

async function up() {
  try {
    const r = await fetch(base);
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
process.on("exit", () => server?.kill());
if (!(await up())) {
  server = spawn("npx", ["next", "start", "-p", String(port)], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) {
    console.error("server did not start; run `npm run build` first");
    process.exit(2);
  }
}

const ROWS = (deviceLast) => `(() => {
  const arts = [...document.querySelectorAll('article')];
  const art = ${deviceLast} ? arts[arts.length - 1] : arts[0];
  const first = art.querySelector('[data-w]'); if (!first) return { rows: [], more: false };
  const body = first.parentElement; const top = body.getBoundingClientRect().top; const rows = {};
  const lh = parseFloat(getComputedStyle(body).lineHeight) || 20;
  for (const w of body.querySelectorAll('[data-w]')) { const r = w.getClientRects(); if (!r.length) continue;
    if (r.length === 1) { const k = Math.round((r[0].top - top) / lh); (rows[k] = rows[k] || []).push(w.textContent); continue; }
    // A word that wraps inside its span (after a hyphen, or CJK): split it by character.
    const node = [...w.childNodes].find((c) => c.nodeType === 3) || w.firstChild?.firstChild; if (!node) continue;
    let curK = null; for (let i = 0; i < node.nodeValue.length; i++) { const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i + 1); const cr = rg.getClientRects(); if (!cr.length) continue;
      const k = Math.round((cr[0].top - top) / lh); rows[k] = rows[k] || []; if (k === curK) rows[k][rows[k].length - 1] += node.nodeValue[i]; else { rows[k].push(node.nodeValue[i]); curK = k; } } }
  return { rows: Object.keys(rows).sort((a,b)=>a-b).map(k => rows[k].join(' ')), more: !!body.querySelector('[data-more]') };
})()`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
// --no-chirp simulates X blocking its CDN: the page must degrade to GT America.
if (args.includes("--no-chirp")) await page.route(/abs\.twimg\.com/, (r) => r.abort());
await page.goto(base);
await page.waitForFunction(() => window.__postcheck?.ready, null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);

// Font sanity: the same reference string measured on x.com (web build) and against the app's metrics.
const REF = "Every week, the 10 most active public voices in";
const widths = await page.evaluate(async (REF) => {
  await Promise.allSettled([document.fonts.load("15px TwitterChirpWeb"), document.fonts.load("15px TwitterChirp"), document.fonts.load("15px GTAmerica"), document.fonts.load("700 15px TwitterChirpWeb"), document.fonts.load("700 15px TwitterChirp")]);
  const m = (family) => { const s = document.createElement("span"); s.style.cssText = `position:absolute;white-space:pre;font-family:${family};font-size:15px`; s.textContent = REF; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 10) / 10; };
  return { web: m("TwitterChirpWeb"), app: m("TwitterChirp") };
}, REF);
await page.waitForFunction(() => !!document.documentElement.dataset.font, null, { timeout: 15000 });
const tier = await page.evaluate(() => document.documentElement.dataset.font);
console.log(`fonts: tier ${tier}; web Chirp ${widths.web}px (x.com measured 320.3), app Chirp ${widths.app}px (expected 313.0)`);
if (args.includes("--no-chirp")) { if (tier !== "gt") { console.error(`expected the GT America tier without X's CDN, got ${tier}`); process.exit(3); } }
else if (tier !== "chirp" || Math.abs(widths.web - 320.3) > 1 || Math.abs(widths.app - 313.0) > 1) { console.error("font metrics drifted; x.com may have shipped a new Chirp build. Re-measure and update globals.css."); process.exit(3); }

let pass = 0, fail = 0, edge = 0;
/** Width of a line of text in the pane's body font, and the body width, for edge-case classification. */
async function lineFit(deviceLast, text) {
  return page.evaluate(({ deviceLast, text }) => {
    const arts = [...document.querySelectorAll("article")];
    const art = deviceLast ? arts[arts.length - 1] : arts[0];
    const body = art.querySelector("[data-w]").parentElement;
    const cs = getComputedStyle(body);
    const s = document.createElement("span");
    s.style.cssText = `position:absolute;white-space:pre;font-family:${cs.fontFamily};font-size:${cs.fontSize}`;
    s.textContent = text;
    body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return { width: Math.round(w * 10) / 10, limit: Math.round(body.getBoundingClientRect().width * 10) / 10 };
  }, { deviceLast, text });
}
/** Type a draft straight into the composer (**bold** / __italic__ markers become styling). */
async function compose(text, opts = {}) {
  await page.evaluate(([t, o]) => window.__postcheck.setDraft(t, o), [text, opts]);
  await page.waitForFunction(() => !document.body.innerText.includes("Fetching preview"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
}
// A native X Article post ends with a link to itself that X adds and hides; nobody typed it.
const corpusTags = new Map(Object.values(JSON.parse(readFileSync("fixtures/corpus.json", "utf8")).accounts).flat().map((p) => [p.id, p.tags ?? []]));
/** The post as its author typed it, from X's saved JSON: t.co expanded, media links dropped (offsets are code points). */
function typedText(fx) {
  const cps = [...fx.text];
  const articlePost = (corpusTags.get(fx.id_str) ?? []).includes("x-article-post");
  const edits = [
    ...(fx.entities?.urls ?? []).map((u) => ({ indices: u.indices, r: articlePost && /\/i\/article\//.test(u.expanded_url) ? "" : u.expanded_url })),
    ...(fx.entities?.media ?? []).map((m) => ({ indices: m.indices, r: "" })),
  ].sort((a, b) => a.indices[0] - b.indices[0]);
  let out = "";
  let cur = 0;
  for (const e of edits) {
    out += cps.slice(cur, e.indices[0]).join("") + e.r;
    cur = e.indices[1];
  }
  return (out + cps.slice(cur).join("")).trimEnd();
}
// X's JSON for a long post carries only the part before Show more, not the words after it. Pad it
// with one word too long to fit, so the tool has to find X's cut on its own.
const LONG_POST_TAIL = " " + "x".repeat(60);
async function load(id) {
  const fx = JSON.parse(readFileSync(`fixtures/posts/${id}.json`, "utf8"));
  const text = typedText(fx);
  await compose(fx.full_text ? fx.full_text.trimEnd() : fx.note_tweet ? text + LONG_POST_TAIL : text, { photo: fx.photos > 0 });
}
async function diff(label, deviceLast, id, expected, got, expMore, gotMore) {
  // Blank lines: app transcriptions record them, the web extractor and the tool's row walk do not.
  const exp = expected.filter((l) => !isUrlLine(l) && l !== "").map(norm);
  const act = got.filter((l) => !isUrlLine(l)).map(norm);
  let bad = null;
  for (let i = 0; i < Math.max(exp.length, act.length); i++) if (exp[i] !== act[i]) { bad = i; break; }
  if (bad === null && expMore === gotMore) { pass++; console.log(`  ok   ${label} ${id}`); return; }
  // A line that differs by one word right at the body edge is a font-metrics coin flip, not a rule error.
  let edgeNote = null;
  if (bad !== null && exp[bad] && act[bad]) {
    const longer = exp[bad].length > act[bad].length ? exp[bad] : act[bad];
    const shorter = longer === exp[bad] ? act[bad] : exp[bad];
    const fit = await lineFit(deviceLast, longer);
    if (Math.abs(fit.width - fit.limit) <= 5) edgeNote = `${fit.width}px vs ${fit.limit}px body`;
    // The folded line: the app's character-level cut landing one or two characters away is the same sub-pixel question.
    else if (expMore && bad === exp.length - 1 && longer.startsWith(shorter) && longer.length - shorter.length <= 2) edgeNote = `fold cut ${longer.length - shorter.length} char(s) off`;
  }
  if (edgeNote) { edge++; console.log(`  edge ${label} ${id}  (${edgeNote})`); }
  else { fail++; console.log(`  FAIL ${label} ${id}`); }
  if (bad !== null) console.log(`       line ${bad + 1}\n         X:    ${exp[bad] ?? "(none)"}\n         tool: ${act[bad] ?? "(none)"}`);
  if (expMore !== gotMore) console.log(`       Show more: X ${expMore} / tool ${gotMore}`);
}

for (const f of readdirSync("fixtures/web")) {
  const fx = JSON.parse(readFileSync(`fixtures/web/${f}`, "utf8"));
  console.log(`\nweb · ${f}`);
  await page.click('[role="tab"]:has-text("Web")');
  await page.selectOption('select[aria-label="Web device"]', fx.device || "web");
  for (const p of fx.posts) {
    if (p.compose) await compose(p.compose); else await load(p.id);
    const got = await page.evaluate(ROWS("false"));
    await diff("web ", false, p.id, p.lines, got.rows, p.showMore, got.more);
  }
}
for (const f of readdirSync("fixtures/app")) {
  const fx = JSON.parse(readFileSync(`fixtures/app/${f}`, "utf8"));
  console.log(`\napp · ${f} (${fx.device})`);
  await page.click('[role="tab"]:has-text("Mobile")');
  await page.selectOption('select[aria-label="App device"]', fx.device);
  for (const p of fx.posts) {
    if (p.compose) await compose(p.compose); else await load(p.id);
    const got = await page.evaluate(ROWS("true"));
    await diff("app ", true, p.id, p.lines, got.rows, p.showMore, got.more);
  }
}
console.log(`\n${pass} passed, ${edge} within font tolerance, ${fail} failed`);
await browser.close();
if (args.includes("--keep")) server = null;
process.exit(fail ? 1 : 0);
