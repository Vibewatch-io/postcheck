import { test } from "node:test";
import assert from "node:assert/strict";

// A share link carries the whole post after `#`: the tracker must be told to drop it (and the
// query), and to report only from the site's own hostname.
test("the Umami tag drops the fragment and query, and only reports from the site's host", async () => {
  process.env.NEXT_PUBLIC_UMAMI_SRC = "https://umami.example/script.js";
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "id";
  const { Analytics } = await import("../src/components/analytics");
  const props = Analytics()?.props as Record<string, string>;
  assert.equal(props["data-exclude-hash"], "true");
  assert.equal(props["data-exclude-search"], "true");
  assert.equal(props["data-domains"], "postcheck.vibewatch.io");
});
