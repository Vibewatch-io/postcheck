// The layout engine (src/lib/layout) against X itself: every corpus post laid out in code and compared
// with the lines x.com, the iPhone and the Android app drew (fixtures/web, fixtures/app), under the same
// rules verify.mjs applies to the browser preview. This is the fidelity check without a browser, so it
// runs in CI. verify.mjs remains the browser gate (and checks the engine against the preview's DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DEVICES, type Device } from "../src/lib/devices";
import { checkPost, linksOf, type Draft, type Lookups } from "../src/lib/check";
import { extractEntities, stripFormatting, tokenize } from "../src/lib/entities";
import type { CardData } from "../src/lib/card";
import { layoutBody, trackingFor, TRACKING } from "../src/lib/layout";
import { measure } from "../src/lib/layout/metrics";
import { SITE_URL } from "../src/lib/site";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("Chirp's metrics reproduce Chrome's widths of the reference line", () => {
  const REF = "Every week, the 10 most active public voices in";
  // x.com draws it 320.3px wide in its Chirp (verify.mjs, globals.css).
  assert.equal(Math.round(measure(REF, { font: "web", bold: false, size: 15, letterSpacing: 0 }).width * 10) / 10, 320.3);
});

test("the engine's tracking is globals.css's Chirp tier", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const root = /:root\s*\{\s*--ls-web:\s*([-\d.]+)px;\s*--ls-app:\s*([-\d.]+)px;\s*--ls-app-post:\s*([-\d.]+)px;/.exec(css);
  assert.ok(root, "no :root tracking line in globals.css");
  assert.deepEqual([Number(root[1]), Number(root[2]), Number(root[3])], [TRACKING.web, TRACKING.app, TRACKING.appPost]);
});

// X's bird: Chirp's default `calt` turns the literal "[CHIRPBIRDICON]" into one glyph, which Chrome
// switches off under letter-spacing (the iPhone pane). Chrome: 17.1875px untracked, 122.625px at -0.18px.
test("the bird ligature forms only without letter-spacing", () => {
  const w = (ls: number) => Math.ceil(measure("[CHIRPBIRDICON]", { font: "web", bold: false, size: 15, letterSpacing: ls }).width * 64) / 64;
  assert.equal(w(0), 17.1875);
  assert.equal(w(-0.18), 122.625);
});

// Chrome's rows at the one column width where each case breaks at the boundary in question (a Chromium
// sweep of a PostBody-shaped body, 2026-11-18). Each failed before its fix: breaks only inside one span;
// a break after "-" refused before digits; no break before an em dash; kerning kept at a mid-word break;
// kerning stopped by Android's word joiner.
const CHROME_ROWS: Array<{ device: string; width: number; text: string; rows: string[] }> = [
  { device: "web", width: 164, text: "We said thanks—@alice and moved on to the next thing", rows: ["We|said|thanks—", "@alice|and|moved|on|to", "the|next|thing"] },
  { device: "web", width: 140, text: "This is a **self**-hosted tool for everyone here today", rows: ["This|is|a|self|-", "hosted|tool|for", "everyone|here|today"] },
  { device: "iphone-16", width: 134, text: "This is a **self**-hosted tool for everyone here today", rows: ["This|is|a|self|-", "hosted|tool|for", "everyone|here", "today"] },
  { device: "iphone-16", width: 147, text: "Write to hello.world@example.com for the details and more", rows: ["Write|to", "hello.world@example", ".com|for|the|details", "and|more"] },
  { device: "galaxy-s25", width: 164, text: "A long-winded well-known end-to-end self-hosted thing here", rows: ["A|long-winded", "well-known", "end-to-end", "self-hosted|thing|here"] },
  { device: "web", width: 324, text: "Prices: $100, €50 and 1–30 days; also 2026-11-18 and well—maybe", rows: ["Prices:|$100,|€50|and|1–30|days;|also|2026-", "11-18|and|well—maybe"] },
  { device: "web", width: 224, text: "Prices: $100, €50 and 1–30 days; also 2026-11-18 and well—maybe", rows: ["Prices:|$100,|€50|and|1–30", "days;|also|2026-11-18|and|well", "—maybe"] },
  // A no-break space holds "hello world" together; too wide for the column, it breaks inside "world".
  { device: "web", width: 60, text: "aa hello\u00a0world", rows: ["aa", "hello|wo", "rld"] },
];

// A keycap is an emoji even though Chirp has its digit (Chrome: 19px at 15px, Apple's emoji font).
test("an emoji sequence is measured as an emoji, not as its first character", () => {
  for (const t of ["1\u20e3", "1\ufe0f\u20e3", "#\ufe0f\u20e3"]) {
    const m = measure(t, { font: "web", bold: false, size: 15, letterSpacing: 0 });
    assert.deepEqual([m.width, m.approximate], [19, true], JSON.stringify(t));
  }
});

// The engine lays the web's Show more after a long post's whole text; on the post page, which never folds,
// a wrapped token must not show up as a trailing empty line.
test("a post page's lines end with the post's last line", () => {
  const lines = checkPost({ text: "word ".repeat(64) }, {}, { devices: ["web-post"] }).devices[0].lines;
  assert.notEqual(lines[lines.length - 1], "");
});

// Fallback text other than emoji is laid out from per-character estimates that miss shaping: the engine
// put "اليسار" alone on line 2 of the Arabic test on the Galaxy S25, where X (and the preview) keep the
// paragraph on one line, and the site and the API both flagged it as dangling. An emoji's fixed advance
// holds, so its paragraph keeps the tip.
test("a paragraph set partly in a non-emoji fallback font gets no dangling-word tip", () => {
  const arabic = json("fixtures/posts/2107204566764949613.json").text;
  const r = checkPost({ text: arabic, plain: true }, {}, { phone: "galaxy-s25", devices: ["galaxy-s25"] });
  assert.deepEqual(r.devices[0].dangling, []);
  assert.ok(!r.advice.some((a) => a.id.startsWith("orphan-")), JSON.stringify(r.advice.map((a) => a.id)));
  const emoji = checkPost({ text: "Shipping the new release today 🚀 with faster.", plain: true }, {}, { phone: "galaxy-s25", devices: ["galaxy-s25"] });
  assert.equal(emoji.devices[0].approximate, true);
  assert.deepEqual(emoji.devices[0].dangling, ["faster."]);
});

test("the engine breaks where Chrome does across spans, dashes and mid-word breaks", () => {
  for (const c of CHROME_ROWS) {
    const d = { ...DEVICES.find((x) => x.id === c.device)!, textWidth: c.width };
    const { text, styles } = stripFormatting(c.text);
    const tokens = tokenize(text, extractEntities(text), styles.flatMap((r) => [r.start, r.end]));
    const rows = layoutBody({ tokens, styles, hiddenUrlStart: null, showMore: false }, d).lines.map((l) => l.words.join("|"));
    assert.deepEqual(rows, c.rows, `${c.device} at ${c.width}px: ${c.text}`);
  }
});

// ---- The corpus, typed the way verify.mjs types it -------------------------------------------------

const corpusTags = new Map<string, string[]>(
  Object.values(json("fixtures/corpus.json").accounts as Record<string, Array<{ id: string; tags?: string[] }>>)
    .flat()
    .map((p) => [p.id, p.tags ?? []]),
);
type FxPost = {
  id_str: string;
  text: string;
  full_text?: string;
  note_tweet?: unknown;
  entities?: { urls?: Array<{ indices: [number, number]; expanded_url: string }>; media?: Array<{ indices: [number, number] }> };
  media?: unknown[];
  photos?: number;
  poll?: Array<{ label: string }>;
};
/** The post as its author typed it, from X's saved JSON: t.co expanded, media links dropped (offsets are code points). */
function typedText(fx: FxPost): string {
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
const LONG_POST_TAIL = " " + "x".repeat(60);

type Fixture = { id: string; compose?: string; lines: string[]; showMore: boolean; gap?: string; gapTool?: string[]; gapMore?: boolean; pollTyped?: string[] };
/** What verify.mjs types for a fixture post: the raw draft (with **bold** / __italic__ markers), media and poll. */
function input(p: Fixture): Draft {
  if (p.compose) return { text: p.compose };
  const fx = json(`fixtures/posts/${p.id}.json`) as FxPost;
  const text = typedText(fx);
  const raw = fx.full_text ? fx.full_text.trimEnd() : fx.note_tweet ? text + LONG_POST_TAIL : text;
  const poll = fx.poll?.map((c) => c.label) ?? p.pollTyped;
  // Media matters only as being there (it replaces any card); its shape doesn't move the text.
  const media = Boolean(fx.media?.length) || (fx.photos ?? 0) > 0 ? [{ kind: "photo" as const, width: 1600, height: 900 }] : undefined;
  return { text: raw, media, poll };
}

const unfurls = json("fixtures/unfurl.json") as Record<string, unknown>;
const byId = new Map(DEVICES.map((d) => [d.id, d]));

/** The engine's visible lines for a fixture post on a device, with card lookups replayed from fixtures/unfurl.json as verify.mjs does. */
function engineLines(p: Fixture, d: Device) {
  const draft = input(p);
  const { cardUrl } = linksOf(draft);
  // The site ships its own card; every other recorded lookup is a card or a "none".
  // A link with no recorded answer fails, as it fails verify.mjs: it must never pass as "no card".
  if (cardUrl && cardUrl !== SITE_URL && !(cardUrl in unfurls)) throw new Error(`no recorded card lookup for ${cardUrl} in fixtures/unfurl.json`);
  const recorded = cardUrl === SITE_URL ? { title: "Postcheck" } : cardUrl ? unfurls[cardUrl] : undefined;
  const lookups: Lookups = { card: recorded ? (recorded as CardData) : "none", quote: "found" };
  const report = checkPost(draft, lookups, { devices: [d.id] }).devices[0];
  return { lines: report.lines, showMore: report.showMore, approximate: report.approximate };
}

// verify.mjs's comparison: URL-only and blank lines skipped, bracket and quote spacing normalised.
const norm = (s: string) => s.replace(/\s+([.,!?:;'’)\]"”…])/g, "$1").replace(/([(["“])\s+/g, "$1").replace(/^\.\s+@/, ".@").replace(/\s+/g, " ").trim();
const isUrlLine = (s: string) => /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,}\S*\/?…?$)/i.test(s.trim());

test("the engine draws the corpus as X does (fixtures/web, fixtures/app)", () => {
  let exact = 0;
  let edge = 0;
  let gaps = 0;
  const approximate: string[] = [];
  const failures: string[] = [];
  for (const dir of ["fixtures/web", "fixtures/app"]) {
    for (const f of readdirSync(dir)) {
      const fx = json(`${dir}/${f}`) as { device?: string; posts: Fixture[] };
      const d = byId.get(fx.device ?? "web");
      assert.ok(d, `${f}: unknown device ${fx.device}`);
      for (const p of fx.posts) {
        const got = engineLines(p, d);
        const exp = p.lines.filter((l) => !isUrlLine(l) && l !== "").map(norm);
        const act = got.lines.filter((l) => !isUrlLine(l) && l !== "").map(norm);
        const bad = Array.from({ length: Math.max(exp.length, act.length) }, (_, i) => i).find((i) => exp[i] !== act[i]);
        const where = `${f} ${p.id} on ${d.id}`;
        if (bad === undefined && p.showMore === got.showMore) {
          exact++;
          continue;
        }
        if (p.gap) {
          const pinned = (p.gapTool ?? []).map(norm).join("\n") === act.join("\n") && (p.gapMore ?? p.showMore) === got.showMore;
          if (pinned) gaps++;
          else failures.push(`${where}: marked gap (${p.gap}) no longer draws its pinned lines`);
          continue;
        }
        // A line that moved by one word right at the column edge is a font-metrics coin flip (verify.mjs):
        // only where the text is the same and the wrap moved, and never a disagreement about Show more.
        const [ej, aj] = [p.lines.join(""), got.lines.join("")].map((t) => t.replace(/\s+/g, ""));
        const sameText = p.showMore === got.showMore && (ej === aj || (p.showMore && (ej.startsWith(aj) || aj.startsWith(ej))));
        if (bad !== undefined && exp[bad] && act[bad] && sameText) {
          const longer = exp[bad].length > act[bad].length ? exp[bad] : act[bad];
          const shorter = longer === exp[bad] ? act[bad] : exp[bad];
          const width = measure(longer, { font: "web", bold: false, size: d.fontSize, letterSpacing: trackingFor(d) }).width;
          if (longer.startsWith(shorter) && (Math.abs(width - d.textWidth) <= 5 || (p.showMore && bad === exp.length - 1 && longer.length - shorter.length <= 2))) {
            edge++;
            continue;
          }
        }
        const detail = bad === undefined ? `Show more: X ${p.showMore} / engine ${got.showMore}` : `line ${bad + 1}\n    X:      ${exp[bad] ?? "(none)"}\n    engine: ${act[bad] ?? "(none)"}`;
        // Text set in fallback fonts (emoji, CJK, Thai, Arabic…) is drawn by each reader's own system fonts:
        // the engine says so and the miss is reported, not failed.
        (got.approximate ? approximate : failures).push(`${where}: ${detail}`);
      }
    }
  }
  if (approximate.length) console.log(`approximate (fallback fonts), not failed:\n  ${approximate.join("\n  ")}`);
  console.log(`layout corpus: ${exact} exact, ${edge} within font tolerance, ${gaps} known gaps, ${approximate.length} approximate, ${failures.length} failed`);
  assert.deepEqual(failures, []);
});

// The engine binary-searches the fallback table: a run out of order makes every lookup past it miss.
test("the fallback-font table is in code-point order at every size", () => {
  const sizes = (JSON.parse(readFileSync("src/lib/layout/fallback-metrics.json", "utf8")) as { sizes: Record<string, { runs: Array<[number, number, number]> }> }).sizes;
  for (const [size, { runs }] of Object.entries(sizes)) {
    runs.forEach((r, i) => assert.ok(r[0] <= r[1] && (i === 0 || r[0] > runs[i - 1][1]), `${size}px run ${i}: ${r[0].toString(16)}`));
  }
});
