import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdvice, type DeviceLines } from "../src/lib/advice";
import { extractEntities, weightedLength } from "../src/lib/entities";
import { DEVICES } from "../src/lib/devices";
import { cardlessKind } from "../src/lib/card";
import { mediaLayout } from "../src/lib/media";

// Tip marks point the preview at a line. A word that dangles at one width must be marked only on
// that device's preview, or the dot lands on a line where nothing is wrong.
test("a dangling word is marked only on the devices where it dangles", () => {
  const text = "one two three four";
  const entities = extractEntities(text);
  const line = (words: string[], start: number) => ({
    words,
    paragraph: 0,
    end: start + words.join(" ").length,
    spans: words.map((w, i) => {
      const s = start + words.slice(0, i).join(" ").length + (i ? 1 : 0);
      return { start: s, end: s + w.length, left: 0, right: 0 };
    }),
  });
  const narrow: DeviceLines = { deviceId: "narrow", deviceLabel: "Narrow", lines: [line(["one", "two", "three"], 0), line(["four"], 14)], total: 2, tokenWidth: 0 };
  const wide: DeviceLines = { deviceId: "wide", deviceLabel: "Wide", lines: [line(["one", "two", "three", "four"], 0)], total: 1, tokenWidth: 0 };
  const advice = buildAdvice({ text, entities, length: weightedLength(text, entities), card: undefined, lineSets: [wide, narrow] });
  const orphan = advice.find((a) => a.id === "orphan-four");
  assert.deepEqual(orphan?.marks, [{ at: 14, devices: ["narrow"] }]);
});

// The tip's text names every preview its dots appear on.
test("a word dangling on two previews names both in the tip", () => {
  const text = "one two three four";
  const entities = extractEntities(text);
  const line = (words: string[], start: number) => ({
    words,
    paragraph: 0,
    end: start + words.join(" ").length,
    spans: words.map((w, i) => {
      const s = start + words.slice(0, i).join(" ").length + (i ? 1 : 0);
      return { start: s, end: s + w.length, left: 0, right: 0 };
    }),
  });
  const lines = [line(["one", "two", "three"], 0), line(["four"], 14)];
  const a: DeviceLines = { deviceId: "a", deviceLabel: "Phone A", lines, total: 2, tokenWidth: 0 };
  const b: DeviceLines = { deviceId: "b", deviceLabel: "Phone B", lines, total: 2, tokenWidth: 0 };
  const tip = buildAdvice({ text, entities, length: weightedLength(text, entities), card: undefined, lineSets: [a, b] }).find((t) => t.id === "orphan-four");
  assert.match(tip?.detail ?? "", /^On Phone A and Phone B that paragraph wraps/);
});

// X builds no card for App Store links although their pages carry the tags (tests 122, 122b): the
// tip must not blame the page.
test("an App Store link's missing card is put down to X, not to the page", () => {
  const text = "Get the app https://apps.apple.com/us/app/x/id333903271";
  const entities = extractEntities(text);
  const advice = buildAdvice({ text, entities, length: weightedLength(text, entities), card: null, lineSets: [] });
  const tip = advice.find((a) => a.id === "no-card");
  assert.match(tip?.detail ?? "", /no preview for App Store links/);
  const other = "Read https://example.com";
  const e2 = extractEntities(other);
  const plain = buildAdvice({ text: other, entities: e2, length: weightedLength(other, e2), card: null, lineSets: [] }).find((a) => a.id === "no-card");
  assert.match(plain?.detail ?? "", /no Open Graph or Twitter Card tags/);
});

// The route answers "failed" when it couldn't read the page (a timeout, a 403, a refused address), and
// "none" only for a page read without tags: a failed lookup must never be blamed on the page's tags.
test("a failed card lookup gets a hedged note, never the missing-tags advice", () => {
  const text = "Read https://example.com/slow";
  const entities = extractEntities(text);
  const advice = buildAdvice({ text, entities, length: weightedLength(text, entities), card: "failed", lineSets: [] });
  assert.equal(advice.find((a) => a.id === "no-card"), undefined);
  assert.equal(advice.find((a) => a.id === "url-mid-text"), undefined);
  assert.match(advice.find((a) => a.id === "card-lookup-failed")?.detail ?? "", /may still show a card/);
});

// A typed X article link is never looked up (test 46): its advice puts the missing card down to X.
test("an X article link's missing card is put down to X, not to the page", () => {
  const text = "Link to an X article https://x.com/i/article/2094473900864520192";
  const entities = extractEntities(text);
  const tip = buildAdvice({ text, entities, length: weightedLength(text, entities), card: null, lineSets: [] }).find((a) => a.id === "no-card");
  assert.match(tip?.detail ?? "", /link to an X article as plain text/);
  assert.doesNotMatch(tip?.detail ?? "", /Open Graph/);
});

// Only an article link itself skips the lookup: a near miss is an ordinary link that may have a card.
test("X article links are recognised by host and the whole path", () => {
  for (const href of ["https://x.com/i/article/123", "https://twitter.com/i/article/123/", "https://www.x.com/i/article/123?s=20", "https://mobile.twitter.com/i/article/123"]) {
    assert.equal(cardlessKind(href), "x-article", href);
  }
  for (const href of ["https://x.com/i/article/123x", "https://x.com/i/article/123/more", "https://x.com/i/articles/123", "https://notx.com/i/article/123", "https://x.com.evil.test/i/article/123"]) {
    assert.equal(cardlessKind(href), null, href);
  }
  assert.equal(cardlessKind("https://apps.apple.com/app/id333903271"), "app-store");
});

// A link that broke after "/" leaves its tail on the last row; that tail isn't a dangling word.
test("a link's tail alone on the last row is not a dangling word", () => {
  const text = "Get the app https://apps.apple.com/us/app/x/id333903271";
  const entities = extractEntities(text);
  const s = text.indexOf("https");
  const lines = [
    { words: ["Get", "the", "app", "apps.apple.com/us/app/x/"], paragraph: 0, end: s, spans: [{ start: s, end: s, left: 90, right: 90, link: true }] },
    { words: ["id333…"], paragraph: 0, end: text.length, spans: [{ start: s, end: text.length, left: 0, right: 50, link: true, cont: true }] },
  ];
  const set: DeviceLines = { deviceId: "app", deviceLabel: "iPhone", lines, total: 2, tokenWidth: 0 };
  const advice = buildAdvice({ text, entities, length: weightedLength(text, entities), card: null, lineSets: [set] });
  assert.equal(advice.find((a) => a.id.startsWith("orphan-")), undefined);
});

// The iOS timeline row drops Premium styling (tests 70, 70b); the tip must say so.
test("the styling tip says the iPhone timeline shows no bold or italic", () => {
  const text = "Ship it today";
  const entities = extractEntities(text);
  const tip = buildAdvice({ text, entities, length: weightedLength(text, entities), card: undefined, lineSets: [], hasStyles: true }).find((a) => a.id === "premium-styles");
  assert.match(tip?.detail ?? "", /iPhone app's timeline, X shows the post with no bold or italic/);
});

test("only an unexpanded iOS timeline row hides styling", async () => {
  const { DEVICES, rowHidesStyles } = await import("../src/lib/devices");
  const ios = DEVICES.find((d) => d.platform === "ios" && d.view === "timeline")!;
  const iosPost = DEVICES.find((d) => d.platform === "ios" && d.view === "post")!;
  const android = DEVICES.find((d) => d.platform === "android" && d.view === "timeline")!;
  const web = DEVICES.find((d) => d.kind !== "phone")!;
  assert.equal(rowHidesStyles(ios), true);
  assert.equal(rowHidesStyles(ios, true), false);
  assert.equal(rowHidesStyles(iosPost), false);
  assert.equal(rowHidesStyles(android), false);
  assert.equal(rowHidesStyles(web), false);
});

// The carousel tip points only at the previews where the media runs past the column: four squares
// do on both; four narrow strips fit whole (in x.com's carousel, in the iPhone's row), and get the
// note that their x.com sizing comes from one capture instead.
test("the media carousel tip marks only the previews that scroll sideways", () => {
  const text = "four photos";
  const entities = extractEntities(text);
  const squares = Array.from({ length: 4 }, () => ({ kind: "photo" as const, width: 1200, height: 1200 }));
  const strips = Array.from({ length: 4 }, () => ({ kind: "photo" as const, width: 87, height: 1200 }));
  const on = (items: typeof squares) =>
    ["web", "iphone-16"].map((id) => {
      const d = DEVICES.find((x) => x.id === id)!;
      return { deviceId: id, deviceLabel: d.label, layout: mediaLayout(items, d)!, ios: d.platform === "ios", tall: false };
    });
  const tip = (items: typeof squares) => buildAdvice({ text, entities, length: weightedLength(text, entities), card: undefined, lineSets: [], hasMedia: true, mediaLayouts: on(items) }).find((a) => a.id === "media-carousel");
  assert.deepEqual(tip(squares)?.marks, [{ el: "attachment", devices: ["web", "iphone-16"] }]);
  assert.equal(tip(strips), undefined);
  const assumed = buildAdvice({ text, entities, length: weightedLength(text, entities), card: undefined, lineSets: [], hasMedia: true, mediaLayouts: on(strips) }).find((a) => a.id === "media-assumed");
  assert.deepEqual(assumed?.marks, [{ el: "attachment", devices: ["web"] }]);
  assert.match(assumed!.detail, /one capture/);
});
