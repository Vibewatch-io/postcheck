import { test } from "node:test";
import assert from "node:assert/strict";
import { Analytics } from "../src/components/analytics";

// A share link carries the whole post after `#`: the tracker must be told to drop it (and the
// query), and a deploy without both variables (a fork, a preview) must load no tracker at all.
test("the Umami tag drops the fragment and query, and loads only when configured", () => {
  delete process.env.NEXT_PUBLIC_UMAMI_SRC;
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "id";
  assert.equal(Analytics(), null);
  process.env.NEXT_PUBLIC_UMAMI_SRC = "https://umami.example/script.js";
  delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  assert.equal(Analytics(), null);
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "id";
  const props = Analytics()?.props as Record<string, string>;
  assert.equal(props["data-exclude-hash"], "true");
  assert.equal(props["data-exclude-search"], "true");
});
