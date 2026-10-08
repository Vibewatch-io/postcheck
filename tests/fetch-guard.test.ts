import { test } from "node:test";
import assert from "node:assert/strict";
import type { LookupAddress } from "node:dns";
import { assertPublic, checkedLookup, readCapped } from "../src/lib/server/fetch-guard";
import { cardMeta, metaLookup } from "../src/lib/server/meta";
import { sameOrigin } from "../src/lib/server/same-origin";

// Pre-launch security pass, 2026-10-08 (Codex + Claude). Each test names the bug class it catches.

test("SSRF: IPv4-mapped, NAT64 and 6to4 literals of private addresses are refused", () => {
  // The URL parser rewrites ::ffff:127.0.0.1 to ::ffff:7f00:1, which a dotted-decimal check read as public.
  for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://[::ffff:10.0.0.1]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[2001:0:4136:e378:8000:63bf:80ff:fffe]/", "http://[2001:2::1]/", "http://[::1]/", "http://[fd00::1]/", "http://127.1/", "http://0x7f000001/"]) {
    assert.throws(() => assertPublic(new URL(u)), /private/, u);
  }
  assert.doesNotThrow(() => assertPublic(new URL("https://93.184.216.34/")));
  assert.doesNotThrow(() => assertPublic(new URL("https://[2606:4700::1111]/")));
  assert.doesNotThrow(() => assertPublic(new URL("https://[2001:4860:4860::8888]/")));
});

test("SSRF: the connection's own lookup refuses a host with any private address (no separate check to rebind past)", async () => {
  const resolveTo = (...addresses: string[]) =>
    checkedLookup((_host, _opts, cb) => cb(null, addresses.map((address): LookupAddress => ({ address, family: address.includes(":") ? 6 : 4 }))));
  const run = (lookup: ReturnType<typeof checkedLookup>, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) => lookup("rebind.test", { all }, (err, address) => resolve({ err, address })));

  for (const addrs of [["127.0.0.1"], ["93.184.216.34", "169.254.169.254"], ["::ffff:7f00:1"]]) {
    const { err } = await run(resolveTo(...addrs), true);
    assert.equal(err?.code, "EPRIVATE", addrs.join(","));
  }
  const ok = await run(resolveTo("93.184.216.34", "2606:4700::1111"), false);
  assert.equal(ok.err, null);
  assert.equal(ok.address, "93.184.216.34");
  const all = await run(resolveTo("93.184.216.34"), true);
  assert.deepEqual(all.address, [{ address: "93.184.216.34", family: 4 }]);
});

test("unfurl: hostile HTML is scanned in linear time", () => {
  // Each of these took 4–80 s under the old regexes at a fraction of the 2 MB cap.
  const cap = 2 * 1024 * 1024;
  for (const [name, html] of [
    ["unclosed <title>", "<title>".repeat(cap / 7)],
    ["unclosed <meta", "<meta ".repeat(cap / 6)],
    ["one long attribute name", `<meta ${"a".repeat(cap - 8)}>`],
  ] as const) {
    const t = performance.now();
    metaLookup(html);
    // Linear runs take tens of ms; the old regexes took minutes. 5 s leaves room for a slow runner.
    assert.ok(performance.now() - t < 5000, `${name}: ${Math.round(performance.now() - t)} ms`);
  }
});

test("unfurl: the linear scan reads the same tags as before", () => {
  const m = metaLookup(`<html><head><TITLE>Plain &amp; simple</TITLE>
    <meta property="og:title" content="OG title"><meta name='twitter:card' content=summary_large_image />
    <meta content="Second wins? No" property="og:title"><meta name="description" content="a > b"></head>`);
  assert.equal(m.get("html:title"), "Plain & simple");
  assert.equal(m.get("og:title"), "OG title");
  assert.equal(m.get("twitter:card"), "summary_large_image");
  // A > inside a value still ends the tag, as it did under the old regex (the cut value is unread).
  assert.equal(m.get("description"), undefined);
  // An unclosed <title> doesn't hide the meta tags after it.
  assert.equal(metaLookup('<title>never closed<meta property="og:title" content="still read">').get("og:title"), "still read");
  // A numeric reference past U+10FFFF stays as written instead of throwing away the whole card.
  assert.equal(metaLookup('<meta property="og:title" content="a &#1114112; b &#x110000; &#x1F680;">').get("og:title"), "a &#1114112; b &#x110000; 🚀");
});

test("fonts: only this origin may load the licensed files, not a sibling subdomain", () => {
  const req = (headers: Record<string, string>) => new Request("https://postcheck.vibewatch.io/fonts/GT-America-Standard-Regular.woff2", { headers });
  assert.equal(sameOrigin(req({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(sameOrigin(req({ "sec-fetch-site": "same-site", origin: "https://other.vibewatch.io" })), false);
  assert.equal(sameOrigin(req({ "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOrigin(req({ "sec-fetch-site": "none" })), false);
  assert.equal(sameOrigin(req({ host: "postcheck.vibewatch.io", origin: "https://postcheck.vibewatch.io" })), true);
  assert.equal(sameOrigin(req({ host: "postcheck.vibewatch.io", referer: "https://other.vibewatch.io/" })), false);
  // The fallback compares whole origins, normalised: scheme counts, case and a default port don't.
  assert.equal(sameOrigin(req({ host: "postcheck.vibewatch.io", origin: "http://postcheck.vibewatch.io" })), false);
  assert.equal(sameOrigin(req({ host: "Postcheck.Vibewatch.io:443", origin: "https://postcheck.vibewatch.io" })), true);
  assert.equal(sameOrigin(req({ "x-forwarded-host": "postcheck.vibewatch.io, internal", "x-forwarded-proto": "https", origin: "https://postcheck.vibewatch.io" })), true);
});

// "none" makes the advice say the page has no tags, so it is only for a page read to its end with no
// social tag at all; anything the route can't be sure of is "failed".
test("a page's card tags: none only for a whole page without social tags", () => {
  assert.equal(cardMeta("<title>Example Domain</title>", true), "none");
  assert.equal(cardMeta("<title>Example Domain</title>", false), "failed"); // cut off at the cap
  assert.equal(cardMeta('<meta property="og:image" content="/a.png">', true), "failed"); // tags, no title
  assert.equal(cardMeta('<title>T</title><meta property="og:title" content="">', true), "failed"); // an empty tag is still a tag
  assert.equal(cardMeta('<title>T</title><meta property="og:description" content="D">', true), "failed"); // OG, but no card key
  assert.deepEqual(cardMeta('<meta property="og:image" content="/a.png"><title>T</title>', true), { title: "T", description: "", imageRaw: "/a.png", cardType: "" });
  const card = cardMeta('<meta name="twitter:card" content="summary_large_image"><meta property="og:title" content="Hi">', false);
  assert.equal(typeof card === "object" && card.cardType, "summary_large_image"); // tags found before the cut still make a card
});

// The chunk that crosses the cap keeps its bytes up to the cap: tags in it must not read as zeros.
test("readCapped keeps the crossing chunk up to the cap", async () => {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(c) { c.enqueue(enc.encode("abc")); c.enqueue(enc.encode("defgh")); c.close(); } });
  assert.equal(new TextDecoder().decode(await readCapped({ body }, 5)), "abcde");
});
