import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PHONE_ID } from "../src/lib/devices";
import { SHARE_MAX_TEXT, SHARE_PREFIX, decodeShare, encodeShare, jpegSize, parseWire, sharedImage, withoutFragment, type SharedPreview } from "../src/lib/share";

/** The header of a JPEG (SOI, APP0, SOF0) claiming the given size: all jpegSize and sharedImage read. */
function jpeg(width: number, height: number): string {
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, ...Array(9).fill(0), 0xff, 0xd9];
  return "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64");
}

const preview: SharedPreview = {
  text: "Bold and italic overlap 🐝\n• a bullet\nhttps://vibewatch.io",
  styles: [
    { start: 0, end: 15, bold: true, italic: false },
    { start: 9, end: 22, bold: true, italic: true },
  ],
  identity: { name: "Vibewatch", handle: "Vibewatch_io", badge: "gold", avatar: jpeg(96, 96) },
  media: jpeg(720, 405),
  theme: "dark",
  phone: "iphone-17-pro-max-post",
  web: "web-post",
  view: "web",
};

async function deflated(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return SHARE_PREFIX + Buffer.from(await new Response(stream).arrayBuffer()).toString("base64url");
}

test("a share link round-trips the whole preview, overlapping styles included", async () => {
  const hash = await encodeShare(preview);
  assert.ok(hash.startsWith(SHARE_PREFIX));
  assert.match(hash.slice(SHARE_PREFIX.length), /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeShare(hash), preview);
});

test("damaged, truncated or foreign fragments open nothing", async () => {
  const hash = await encodeShare(preview);
  assert.equal(await decodeShare("#other=1"), null);
  assert.equal(await decodeShare(SHARE_PREFIX + "not base64!"), null);
  assert.equal(await decodeShare(hash.slice(0, Math.floor(hash.length / 2))), null);
  assert.equal(await decodeShare(SHARE_PREFIX + "A".repeat(70_000)), null);
  assert.equal(await decodeShare(await deflated(JSON.stringify({ v: 2, text: "future" }))), null);
});

test("a small link that inflates past the cap is refused", async () => {
  const bomb = await deflated(JSON.stringify({ v: 1, text: "x", pad: " ".repeat(2_000_000) }));
  assert.ok(bomb.length < 10_000);
  assert.equal(await decodeShare(bomb), null);
});

test("device ids must match their view's kind", () => {
  const p = parseWire({ v: 1, text: "hi", styles: [], phone: "web", web: "iphone-16", view: "app" });
  assert.equal(p?.phone, DEFAULT_PHONE_ID);
  assert.equal(p?.web, "web");
});

test("style runs outside the text or with unknown flags are dropped", () => {
  const p = parseWire({ v: 1, text: "hello", styles: [[0, 5, 1], [3, 9, 1], [2, 2, 2], [0, 1, 4], [0, 1.5, 1], "x"] });
  assert.deepEqual(p?.styles, [{ start: 0, end: 5, bold: true, italic: false }]);
});

test("only JPEG data URLs Share could have made are shown", () => {
  assert.equal(sharedImage(jpeg(96, 96)), jpeg(96, 96));
  assert.equal(sharedImage("https://example.com/pixel.jpg"), null);
  assert.equal(sharedImage("data:image/png;base64,iVBORw0KGgo="), null);
  assert.equal(sharedImage("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(sharedImage(jpeg(20_000, 20_000)), null);
  assert.equal(sharedImage("data:image/jpeg;base64,/9j/" + "A".repeat(300_000)), null);
  assert.deepEqual(jpegSize(Uint8Array.from(Buffer.from(jpeg(720, 405).split(",")[1], "base64"))), { width: 720, height: 405 });
});

test("analytics never records a share link's fragment", async () => {
  const url = "https://postcheck.vibewatch.io/" + (await encodeShare(preview));
  assert.equal(withoutFragment(url), "https://postcheck.vibewatch.io/");
  assert.equal(withoutFragment("https://postcheck.vibewatch.io/?utm_source=x#s=abc"), "https://postcheck.vibewatch.io/?utm_source=x");
  assert.equal(withoutFragment("https://postcheck.vibewatch.io/"), "https://postcheck.vibewatch.io/");
});

// Such text fits the link budget yet a shared page can't open it, which is why Share refuses it first.
test("text past the shared page's limit compresses small but never opens", async () => {
  const long = { ...preview, text: "a".repeat(SHARE_MAX_TEXT + 1), styles: [] };
  const hash = await encodeShare(long);
  assert.ok(hash.length < 1_000, "compresses far below the link budget");
  assert.equal(await decodeShare(hash), null);
});
