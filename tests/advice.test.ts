import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdvice, type DeviceLines } from "../src/lib/advice";
import { extractEntities, weightedLength } from "../src/lib/entities";

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
