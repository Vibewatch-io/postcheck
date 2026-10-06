import { test } from "node:test";
import assert from "node:assert/strict";
import * as unfurl from "../src/app/api/unfurl/route";
import * as profile from "../src/app/api/profile/route";
import * as quote from "../src/app/api/quote/route";

// The lookups take their input in a POST body so links and handles never sit in a cacheable address.
// A stray GET must still answer with a response no cache keeps (Next's automatic 405 carries no
// cache-control), since its address may hold a link or handle.
for (const [name, route] of [["unfurl", unfurl], ["profile", profile], ["quote", quote]] as const) {
  test(`/api/${name} refuses GET with an uncacheable 405`, () => {
    assert.equal(typeof route.GET, "function");
    const res = route.GET();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("allow"), "POST");
  });
}

import { readLookupField } from "../src/lib/server/fetch-guard";

// A body that breaks off mid-upload is a bad request, not an unhandled error.
test("a lookup body stream that errors reads as no input", async () => {
  const body = new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error("client went away")); } });
  const req = new Request("http://localhost/api/unfurl", { method: "POST", body, duplex: "half" } as RequestInit);
  assert.equal(await readLookupField(req, "url"), null);
});

// The route accepts links up to 2048 characters; in UTF-8 a long non-Latin link runs past 4 KB of JSON.
test("a 2048-character link in CJK fits the lookup body cap", async () => {
  const url = "https://example.com/" + "漢".repeat(2028);
  const req = new Request("http://localhost/api/unfurl", { method: "POST", body: JSON.stringify({ url }) });
  assert.equal(await readLookupField(req, "url"), url);
});
