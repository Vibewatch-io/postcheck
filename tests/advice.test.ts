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
