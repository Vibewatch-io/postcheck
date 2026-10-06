import { test } from "node:test";
import assert from "node:assert/strict";
import * as unfurl from "../src/app/api/unfurl/route";
import * as profile from "../src/app/api/profile/route";

// The lookups take their input in a POST body so links and handles never sit in a cacheable address.
// A stray GET must still answer with a response no cache keeps (Next's automatic 405 carries no
// cache-control), since its address may hold a link or handle.
for (const [name, route] of [["unfurl", unfurl], ["profile", profile]] as const) {
  test(`/api/${name} refuses GET with an uncacheable 405`, () => {
    assert.equal(typeof route.GET, "function");
    const res = route.GET();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("allow"), "POST");
  });
}
