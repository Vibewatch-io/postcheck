import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractEntities, weightedLength, showMoreCut, displayUrl, tokenize, appFoldCut, stripFormatting, MAX_WEIGHTED_LENGTH } from "../src/lib/entities";

interface Fixture {
  id_str: string;
  text: string;
  display_text_range?: [number, number];
  note_tweet: boolean;
  entities?: { urls?: Array<{ display_url: string; expanded_url: string; indices: [number, number]; url: string }>; media?: Array<{ indices: [number, number] }>; user_mentions?: Array<{ screen_name: string; indices: [number, number] }>; hashtags?: Array<{ text: string }> };
}

const dir = join(__dirname, "..", "fixtures", "posts");
const fixtures: Fixture[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

/** Rebuild the typed text: t.co expanded, media links dropped (offsets are code points). */
function typedText(f: Fixture): string {
  const cps = [...f.text];
  const edits = [
    ...(f.entities?.urls ?? []).map((u) => ({ indices: u.indices, r: u.expanded_url })),
    ...(f.entities?.media ?? []).map((m) => ({ indices: m.indices, r: "" })),
  ].sort((a, b) => a.indices[0] - b.indices[0]);
  let out = "";
  let cur = 0;
  for (const e of edits) {
    out += cps.slice(cur, e.indices[0]).join("") + e.r;
    cur = e.indices[1];
  }
  return (out + cps.slice(cur).join("")).trimEnd();
}

test("fixtures loaded", () => {
  assert.ok(fixtures.length >= 5, "need real posts in fixtures/posts");
});

for (const f of fixtures) {
  const text = typedText(f);
  const entities = extractEntities(text);

  test(`${f.id_str}: every X link is found with X's display text`, () => {
    for (const u of f.entities?.urls ?? []) {
      const ours = entities.find((e) => e.type === "url" && e.href === u.expanded_url);
      assert.ok(ours, `missing url ${u.expanded_url}`);
      assert.equal(ours!.display, u.display_url);
      assert.equal(displayUrl(u.expanded_url), u.display_url);
    }
    assert.equal(entities.filter((e) => e.type === "url").length, (f.entities?.urls ?? []).length, "extra or missing links");
  });

  test(`${f.id_str}: every X mention is found`, () => {
    for (const m of f.entities?.user_mentions ?? []) {
      assert.ok(entities.some((e) => e.type === "mention" && e.text.toLowerCase() === `@${m.screen_name.toLowerCase()}`), `missing @${m.screen_name}`);
    }
  });

  test(`${f.id_str}: weighted length agrees with X's 280 rule`, () => {
    const { weighted } = weightedLength(text, entities);
    if (f.note_tweet) {
      // Syndication only carries the timeline prefix of a long post; it must fit.
      assert.ok(weighted <= MAX_WEIGHTED_LENGTH, `long-post prefix weighs ${weighted}`);
    } else {
      assert.ok(weighted <= MAX_WEIGHTED_LENGTH, `${weighted} > 280 for a standard post`);
    }
  });

  test(`${f.id_str}: tokens round-trip the text`, () => {
    const tokens = tokenize(text, entities);
    let rebuilt = "";
    for (const t of tokens) rebuilt += t.kind === "newline" ? "\n" : t.kind === "entity" ? text.slice(t.start, t.end) : t.text;
    assert.equal(rebuilt, text);
    for (const t of tokens) assert.equal(text.slice(t.start, t.end), t.kind === "newline" ? "\n" : t.kind === "entity" ? t.entity.text : t.text);
  });
}

test("Show more cut lands where x.com cut a live long post", () => {
  // Measured on x.com 2026-09-10 (post 2085516290941472896): visible text ends "...1-10, in" then " Show more".
  const prefix =
    "NEW comparison: Vibewatch vs Dash Social, for community sentiment.\n\nDash Social's Social Listening is a separate add-on with no published price, stacked on a $999-1,999/mo content suite — and it still doesn't reach Discord or Telegram. Vibewatch scores every message 1-10, in";
  const full = `${prefix} context, starting at $19/mo, on every plan.`;
  const { limitIndex } = weightedLength(full, extractEntities(full));
  assert.equal(showMoreCut(full, limitIndex), prefix.length);
});

test("a word ending exactly at 280 stays before Show more", () => {
  // x.com 2089427094224974124: X's visible text is exactly 280 weighted and ends "weighted like".
  const head = "a".repeat(266) + " weighted like";
  assert.equal(head.length, 280);
  const full = `${head} and more after the cut`;
  const { limitIndex } = weightedLength(full, extractEntities(full));
  assert.equal(showMoreCut(full, limitIndex), head.length);
});

test("display URL keeps 15 path characters", () => {
  assert.equal(displayUrl("https://www.techcrunch.com/2019/08/29/twitter-thing"), "techcrunch.com/2019/08/29/twi…");
  assert.equal(displayUrl("https://stacks.vibewatch.io/?utm_source=x&utm_medium=social"), "stacks.vibewatch.io/?utm_source=x&…");
  assert.equal(displayUrl("example.com"), "example.com");
});

test("weights: emoji 2, CJK 2, URL 23, Latin 1", () => {
  const t = "ab 😀 日本 https://example.com/x";
  const { weighted, emoji } = weightedLength(t, extractEntities(t));
  assert.equal(emoji, 1);
  assert.equal(weighted, 2 + 1 + 2 + 1 + 4 + 1 + 23);
});

test("email addresses and unknown bare TLDs don't link", () => {
  const e = extractEntities("mail me@example.com or see foo.internal and go.to/x");
  assert.deepEqual(e.filter((x) => x.type === "url").map((x) => x.text), ["go.to/x"]);
});

test("X itself gives every link 23 characters in the raw post text", () => {
  for (const f of fixtures) for (const u of f.entities?.urls ?? []) assert.equal(u.indices[1] - u.indices[0], 23, `${f.id_str} ${u.expanded_url}`);
});

test("a family emoji is one unit of weight 2, not eleven code units", () => {
  const t = "👨‍👩‍👧‍👦 hi";
  assert.equal(weightedLength(t, extractEntities(t)).weighted, 2 + 1 + 2);
});

test("app fold drops the last character of the last shown line, then trims", () => {
  const a = "See the list live ↓\nhttps://stacks.vibewatch.io/";
  assert.equal(a.slice(0, appFoldCut(a, a.indexOf("\n"))), "See the list live");
  const b = "Weekly reports now use each day's closing token price.\n\nFull notes ↓";
  assert.equal(b.slice(0, appFoldCut(b, b.indexOf("\n"))), "Weekly reports now use each day's closing token price");
});

test("app fold keeps the longest prefix that fits beside Show more, then eats one more character", () => {
  const spansFor = (t: string, lineText: string, perChar: number) => {
    const out: Array<{ start: number; end: number; left: number; right: number }> = [];
    let x = 0;
    let from = t.indexOf(lineText);
    for (const w of lineText.split(" ")) {
      const start = t.indexOf(w, from);
      const width = [...w].length * perChar;
      out.push({ start, end: start + w.length, left: x, right: x + width });
      x += width + perChar * 0.5;
      from = start + w.length;
    }
    return out;
  };
  // Buzz post: line 8 "what your community is saying on socials." on a 322px body; line 9 is blank.
  const t = "🐝 Receive automatic weekly reports about what your community is saying on socials.\n\nAvailable today.";
  const line = "what your community is saying on socials.";
  const spans = spansFor(t, line, 7);
  const lineEnd = t.indexOf("\n\n") + 1;
  // Fits through "on s" (236.8px in Chirp), so the app shows "…saying on".
  const onS = spans[6].left + 7; // right edge after "s"
  const cut = appFoldCut(t, lineEnd, { spans, tokenWidth: 322 - onS - 1, textWidth: 322 });
  assert.equal(t.slice(0, cut), "🐝 Receive automatic weekly reports about what your community is saying on");
  // Whole short line fits: still loses its last character ("See the list live ↓" → "live").
  const u = "See the list live ↓\nhttps://stacks.vibewatch.io/";
  const sp2 = spansFor(u, "See the list live ↓", 7);
  const cut2 = appFoldCut(u, u.indexOf("\n"), { spans: sp2, tokenWidth: 78, textWidth: 322 });
  assert.equal(u.slice(0, cut2), "See the list live");
  // goodforbtc: "…80,000 customers" fills the line; "…80,000" fits beside the token, so the app shows "80,00".
  const v = "Plus Trezor's leak grows to 80,000 customers\nand the Genesis Bond sells out ↓";
  const sp3 = spansFor(v, "Plus Trezor's leak grows to 80,000 customers", 7);
  const after80000 = sp3[5].right;
  const cut3 = appFoldCut(v, v.indexOf("\n"), { spans: sp3, tokenWidth: 322 - after80000 - 3, textWidth: 322 });
  assert.equal(v.slice(0, cut3), "Plus Trezor's leak grows to 80,00");
});

test("formatting markers become style runs and are never counted", () => {
  const r = stripFormatting("Ship **it** __today__ and **__both__**");
  assert.equal(r.text, "Ship it today and both");
  assert.deepEqual(r.styles.map((s) => [r.text.slice(s.start, s.end), s.bold, s.italic]), [["it", true, false], ["today", false, true], ["both", false, true], ["both", true, false]]);
  const u = stripFormatting("an unclosed **marker stays");
  assert.equal(u.text, "an unclosed **marker stays");
  assert.equal(u.styles.length, 0);
});

import { draftToDoc, serializeDoc, trimDraft } from "../src/lib/draft";

test("editor document round-trips to the posted text, bullets as • lines, styles as runs", () => {
  const text = "Ship it\n\n• one\n• two\nend **x**";
  const styles = [{ start: 0, end: 4, bold: true, italic: false }, { start: 17, end: 20, bold: false, italic: true }];
  const doc = draftToDoc(text, styles);
  assert.equal(doc.content!.filter((n) => n.type === "bulletList").length, 1);
  const back = serializeDoc(doc);
  assert.equal(back.text, text);
  assert.deepEqual(back.styles, styles);
  // X collapses stacked blank lines to one (@postcheck_test/status/2100300298313183628) and keeps inner spaces.
  const posted = JSON.parse(readFileSync(join(dir, "2100300298313183628.json"), "utf8")).text;
  assert.equal(trimDraft({ text: "Blank lines test 14: one blank line below.\n\nThree blank lines below this paragraph.\n\n\n\nLast paragraph.", styles: [] }).text, posted);
  const spaced = JSON.parse(readFileSync(join(dir, "2100300746269008191.json"), "utf8")).text;
  assert.equal(trimDraft({ text: "Spacing test 17:  two spaces,   three spaces,    four spaces, and a trailing space. ", styles: [] }).text, spaced);
  const kept = trimDraft({ text: "a\n\n\n\nb **c**", styles: [{ start: 7, end: 8, bold: true, italic: false }] });
  assert.equal(kept.text, "a\n\nb **c**");
  assert.deepEqual(kept.styles, [{ start: 5, end: 6, bold: true, italic: false }]);
  const t = trimDraft({ text: "  hi **there**  ", styles: [{ start: 5, end: 10, bold: true, italic: false }] });
  assert.equal(t.text, "hi **there**");
  assert.deepEqual(t.styles, [{ start: 3, end: 8, bold: true, italic: false }]);
});
