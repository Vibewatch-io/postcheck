import { test } from "node:test";
import assert from "node:assert/strict";
import { tagLine } from "../src/lib/post-state";

test("the tag line names one or two people as X does and counts the rest", () => {
  assert.equal(tagLine(""), "");
  assert.equal(tagLine(" Vibewatch "), "Vibewatch");
  assert.equal(tagLine("Vibewatch, Good For Bitcoin"), "Vibewatch and Good For Bitcoin");
  assert.equal(tagLine("A, , B,"), "A and B");
  assert.equal(tagLine("A, B, C"), "A and 2 others");
  assert.equal(tagLine(`${"n".repeat(60)}, B`), `${"n".repeat(50)} and B`);
});
