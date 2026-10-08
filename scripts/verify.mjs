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

// The post's own text (quote = false) or the quoted post's inside its embed (quote = true). A quote
// embed clamps its text, so rows past the clamp are laid out but clipped: they don't count.
const ROWS = (deviceLast, quote = false) => `(() => {
  const arts = [...document.querySelectorAll('article')];
  const art = ${deviceLast} ? arts[arts.length - 1] : arts[0];
  const first = [...art.querySelectorAll('[data-w]')].find((w) => !!w.closest('[data-quote]') === ${quote}); if (!first) return { rows: [], more: false };
  const body = first.parentElement; const top = body.getBoundingClientRect().top; const rows = {};
  const lh = parseFloat(getComputedStyle(body).lineHeight) || 20;
  const shown = Math.round(body.getBoundingClientRect().height / lh);
  for (const w of body.querySelectorAll('[data-w]')) { const r = w.getClientRects(); if (!r.length || Math.round((r[0].top - top) / lh) >= shown) continue;
    const ks = [...r].map((x) => Math.round((x.top - top) / lh));
    if (ks.every((k) => k === ks[0])) { (rows[ks[0]] = rows[ks[0]] || []).push(w.textContent); continue; }
    // A word that wraps inside its span (after a hyphen, CJK, or a link's <wbr> after "/"): split it by
    // character, across every text node in the span.
    const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let node, curK = null;
    while ((node = walker.nextNode())) for (let i = 0; i < node.nodeValue.length; i++) { const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i + 1); const cr = rg.getClientRects(); if (!cr.length) continue;
      const k = Math.round((cr[0].top - top) / lh); rows[k] = rows[k] || []; if (k === curK) rows[k][rows[k].length - 1] += node.nodeValue[i]; else { rows[k].push(node.nodeValue[i]); curK = k; } } }
  return { rows: Object.keys(rows).sort((a,b)=>a-b).filter((k) => k < shown).map(k => rows[k].join(' ')), more: !!body.querySelector('[data-more]') };
})()`;
/** The quote embed's box, and its avatar's, text's, photo's and "Show this poll" line's, relative to the embed. */
const QUOTE_BOX = (deviceLast) => `(() => {
  const arts = [...document.querySelectorAll('article')];
  const art = ${deviceLast} ? arts[arts.length - 1] : arts[0];
  const q = art.querySelector('[data-quote]'); if (!q) return null; const b = q.getBoundingClientRect();
  const rel = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left - b.left), Math.round(r.top - b.top), Math.round(r.width), Math.round(r.height)]; };
  const text = [...q.querySelectorAll('[data-w]')][0]?.parentElement;
  return { box: [Math.round(b.width), Math.round(b.height)], avatar: rel(q.querySelector('img, svg')), text: rel(text), photo: rel(q.querySelector('[data-quote-photo]')), poll: rel(q.querySelector('[data-quote-poll]')) };
})()`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
// Quote lookups replay FxTwitter answers recorded in fixtures/fx (tests/quote.test.ts checks the
// route's reading of them), so verify never depends on a live post. Images become a grey stand-in
// of the recorded size; a post with no recording answers as unavailable.
const STAND_IN = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
await page.route(/\/api\/quote$/, (route) => {
  const id = route.request().postDataJSON()?.id;
  let t = null;
  try { t = JSON.parse(readFileSync(`fixtures/fx/${id}.json`, "utf8")).tweet; } catch {}
  const v = t?.author.verification;
  const photo = t?.media?.photos?.[0];
  const body = t
    ? { status: "ok", quote: { id, name: t.author.name, handle: t.author.screen_name, avatar: null, badge: !v?.verified ? "none" : v.type === "organization" ? "gold" : v.type === "government" ? "gray" : "blue", text: t.text, createdAt: new Date(t.created_at).toISOString(), photo: photo ? { src: STAND_IN, width: photo.width, height: photo.height } : null, poll: Boolean(t.poll) } }
    : { status: "unavailable" };
  return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
});
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

let pass = 0, fail = 0, edge = 0, gap = 0;
/** Width of a line of text in the pane's body font (the quote embed's with `quote`), and that body's width, for edge-case classification. */
async function lineFit(deviceLast, text, quote = false) {
  return page.evaluate(({ deviceLast, text, quote }) => {
    const arts = [...document.querySelectorAll("article")];
    const art = deviceLast ? arts[arts.length - 1] : arts[0];
    const body = [...art.querySelectorAll("[data-w]")].find((w) => !w.closest("[data-quote]") !== quote).parentElement;
    const cs = getComputedStyle(body);
    const s = document.createElement("span");
    s.style.cssText = `position:absolute;white-space:pre;font-family:${cs.fontFamily};font-size:${cs.fontSize}`;
    s.textContent = text;
    body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return { width: Math.round(w * 10) / 10, limit: Math.round(body.getBoundingClientRect().width * 10) / 10 };
  }, { deviceLast, text, quote });
}
/** Type a draft straight into the composer (**bold** / __italic__ markers become styling). */
async function compose(text, opts = {}) {
  await page.evaluate(([t, o]) => window.__postcheck.setDraft(t, o), [text, opts]);
  await page.waitForFunction(() => !document.body.innerText.includes("Fetching preview") && !document.body.innerText.includes("Loading post…"), null, { timeout: 15000 }).catch(() => {});
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
async function diff(label, deviceLast, id, expected, got, expMore, gotMore, knownGap, gapTool) {
  // Blank lines: app transcriptions record them, the web extractor and the tool's row walk do not.
  const exp = expected.filter((l) => !isUrlLine(l) && l !== "").map(norm);
  const act = got.filter((l) => !isUrlLine(l)).map(norm);
  let bad = null;
  for (let i = 0; i < Math.max(exp.length, act.length); i++) if (exp[i] !== act[i]) { bad = i; break; }
  if (bad === null && expMore === gotMore) { pass++; console.log(`  ok   ${label} ${id}${knownGap ? "  (marked gap now passes: drop the gap)" : ""}`); return; }
  // A fixture can name a feature the tool doesn't model yet (a poll, a card X withholds for an
  // unknown reason) and pin what the tool draws meanwhile (`gapTool`): reported as a gap on every
  // run, and as a failure if anything else about the post changes. Checked before the edge
  // tolerance so a drifting gap post can't pass as a font coin flip.
  if (knownGap) {
    const pinned = Array.isArray(gapTool) && gapTool.map(norm).join("\n") === act.join("\n") && expMore === gotMore;
    if (pinned) { gap++; console.log(`  gap  ${label} ${id}  (${knownGap})`); }
    else {
      fail++;
      const why = !Array.isArray(gapTool) ? "marked gap has no gapTool pin" : expMore !== gotMore ? "marked gap, but Show more drifted" : "marked gap, but the tool no longer draws its pinned gapTool lines";
      console.log(`  FAIL ${label} ${id}  (${why})`);
    }
    if (bad !== null) console.log(`       line ${bad + 1}\n         X:    ${exp[bad] ?? "(none)"}\n         tool: ${act[bad] ?? "(none)"}`);
    if (expMore !== gotMore) console.log(`       Show more: X ${expMore} / tool ${gotMore}`);
    return;
  }
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

/**
 * The quote embed against X's: web fixtures record x.com's quoted lines and boxes, app fixtures the
 * iPhone's line count, first words, last line where recorded, and photo size. Boxes match to 1px. Where the app's photo sits
 * is not checked (the gap above it is inferred, QUIRKS.md).
 */
async function quoteDiff(label, deviceLast, id, want) {
  const got = await page.evaluate(QUOTE_BOX(deviceLast));
  const rows = (await page.evaluate(ROWS(String(deviceLast), true))).rows.map(norm);
  const near = (a, b) => Array.isArray(a) && Array.isArray(b) && a.every((v, i) => b[i] === null || Math.abs(v - b[i]) <= 1);
  const problems = [];
  let edgeNote = null;
  if (!got) problems.push("no quote embed");
  else if (Array.isArray(want.lines)) {
    const exp = want.lines.map(norm);
    if (exp.join("\n") !== rows.join("\n")) {
      const lines = `lines\n         X:    ${exp.join(" | ")}\n         tool: ${rows.join(" | ")}`;
      // The same coin flip as diff(): the first differing line lands within 5px of the quote's text
      // column. The boxes below stay exact, so a shift that changes the line count still fails.
      const bad = exp.findIndex((l, i) => l !== rows[i]);
      const [a, b] = [exp[bad], rows[bad]];
      const fit = a && b ? await lineFit(deviceLast, a.length > b.length ? a : b, true) : null;
      if (fit && Math.abs(fit.width - fit.limit) <= 5) edgeNote = [`${fit.width}px vs ${fit.limit}px text`, lines];
      else problems.push(lines);
    }
    if (!near(got.box, want.box)) problems.push(`box X ${want.box} / tool ${got.box}`);
    if (want.avatar && !near(got.avatar, want.avatar)) problems.push(`avatar X ${want.avatar} / tool ${got.avatar}`);
    if (want.text && !near(got.text, want.text)) problems.push(`text box X ${want.text} / tool ${got.text}`);
    if (want.photo && !near(got.photo, want.photo)) problems.push(`photo X ${want.photo} / tool ${got.photo}`);
    if (!!want.poll !== !!got.poll || (want.poll && !near(got.poll.slice(0, 2), want.poll.slice(0, 2)))) problems.push(`poll line X ${want.poll} / tool ${got.poll}`);
  } else {
    if (rows.length !== want.lines) problems.push(`line count X ${want.lines} / tool ${rows.length}`);
    if (!(rows[0] ?? "").startsWith(norm(want.text))) problems.push(`first line X "${want.text}…" / tool "${rows[0] ?? ""}"`);
    if (want.last !== undefined && (rows[rows.length - 1] ?? "") !== norm(want.last)) problems.push(`last line X "${want.last}" / tool "${rows[rows.length - 1] ?? ""}"`);
    if (want.photo && !near(got.photo?.slice(2), want.photo.slice(2))) problems.push(`photo size X ${want.photo.slice(2)} / tool ${got.photo?.slice(2)}`);
    if (!want.photo && got.photo) problems.push("tool draws a photo X doesn't");
  }
  if (problems.length) {
    fail++;
    console.log(`  FAIL ${label} quote ${id}\n       ${problems.join("\n       ")}`);
  } else if (edgeNote) {
    edge++;
    console.log(`  edge ${label} quote ${id}  (${edgeNote[0]})\n       ${edgeNote[1]}`);
  } else {
    pass++;
    console.log(`  ok   ${label} quote ${id}`);
  }
}

for (const f of readdirSync("fixtures/web")) {
  const fx = JSON.parse(readFileSync(`fixtures/web/${f}`, "utf8"));
  console.log(`\nweb · ${f}`);
  await page.click('[role="tab"]:has-text("Web")');
  await page.selectOption('select[aria-label="Web device"]', fx.device || "web");
  for (const p of fx.posts) {
    if (p.compose) await compose(p.compose); else await load(p.id);
    const got = await page.evaluate(ROWS("false"));
    await diff("web ", false, p.id, p.lines, got.rows, p.showMore, got.more, p.gap, p.gapTool);
    if (p.quote && typeof p.quote === "object") await quoteDiff("web ", false, p.id, p.quote);
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
    await diff("app ", true, p.id, p.lines, got.rows, p.showMore, got.more, p.gap, p.gapTool);
    if (p.quote && typeof p.quote === "object") await quoteDiff("app ", true, p.id, p.quote);
  }
}
console.log(`\n${pass} passed, ${edge} within font tolerance, ${gap} known gaps, ${fail} failed`);
await browser.close();
if (args.includes("--keep")) server = null;
process.exit(fail ? 1 : 0);
