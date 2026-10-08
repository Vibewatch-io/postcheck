import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEVICES } from "../src/lib/devices";
import { mediaLayout, videoTime, type MediaKind } from "../src/lib/media";

// The layout rules against every recorded media box. CI has no browser, so this is where a rule
// change that moves a box gets caught before `npm run verify` is run locally.

type Recorded = { media?: { items: Array<[number, number, number | null, number, string]>; gap?: string } };
const posts = (file: string) => JSON.parse(readFileSync(file, "utf8")).posts as Array<Recorded & { id: string }>;
const shapes = (id: string) =>
  (JSON.parse(readFileSync(`fixtures/posts/${id}.json`, "utf8")).media as Array<{ type: string; width: number; height: number }>).map((m) => ({
    kind: (m.type === "animated_gif" ? "gif" : m.type) as MediaKind,
    width: m.width,
    height: m.height,
  }));

function check(file: string, deviceId: string, tolerance: number) {
  const device = DEVICES.find((d) => d.id === deviceId)!;
  let checked = 0;
  for (const p of posts(file)) {
    if (!p.media || p.media.gap) continue;
    const layout = mediaLayout(shapes(p.id), device)!;
    // The app records only the items on screen: a carousel's first item and the one peeking in.
    if (tolerance > 1) assert.ok(layout.boxes.length >= p.media.items.length, `${p.id}: item count`);
    else assert.equal(layout.boxes.length, p.media.items.length, `${p.id}: item count`);
    p.media.items.forEach(([x, y, w, h], i) => {
      const b = layout.boxes[i];
      const near = (got: number, want: number | null) => want === null || Math.abs(got - want) <= tolerance;
      assert.ok(near(b.x, x) && near(b.y, y) && near(b.w, w) && near(b.h, h), `${p.id} item ${i + 1}: X [${x}, ${y}, ${w}, ${h}] / rule [${b.x}, ${b.y}, ${b.w}, ${b.h}]`);
    });
    checked++;
  }
  return checked;
}

test("x.com media boxes: every recorded post to 1px", () => {
  assert.equal(check("fixtures/web/postcheck_test.json", "web", 1), 19);
});

// Screen captures read ±1pt at each edge: the same 16:9 photo reads 322×182 (test 50) and 324×183 (test 110).
test("iPhone media boxes: every recorded post to 2pt", () => {
  assert.equal(check("fixtures/app/iphone-16.json", "iphone-16", 2), 17);
});

test("video length reads m:ss", () => {
  assert.equal(videoTime(6000), "0:06");
  assert.equal(videoTime(75_400), "1:15");
  assert.equal(videoTime(5_400_000), "1:30:00");
});
