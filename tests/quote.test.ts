import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVATAR_CAP, PHOTO_CAP, lookupProfile, lookupQuote, twimgUrl } from "../src/lib/server/fxtwitter";
import { fetchImageAsDataUrl, guardedFetch, type GuardFetch } from "../src/lib/server/fetch-guard";
import { quoteTime, statusId } from "../src/lib/quote";
import { extractEntities, quoteUrl } from "../src/lib/entities";
import { POST } from "../src/app/api/quote/route";

const fixtures = join(__dirname, "..", "fixtures");
/** FxTwitter's answer for a quoted @postcheck_test post, recorded 2026-10-06 (counters dropped). */
const fx = (id: string) => readFileSync(join(fixtures, "fx", `${id}.json`), "utf8");

/** X's own JSON for the same post, rebuilt to the typed text (t.co expanded, media links dropped). */
function typedText(id: string): string {
  const f = JSON.parse(readFileSync(join(fixtures, "posts", `${id}.json`), "utf8")) as {
    text: string;
    entities?: { urls?: Array<{ expanded_url: string; indices: [number, number] }>; media?: Array<{ indices: [number, number] }> };
  };
  const cps = [...f.text];
  const edits = [...(f.entities?.urls ?? []).map((u) => ({ i: u.indices, r: u.expanded_url })), ...(f.entities?.media ?? []).map((m) => ({ i: m.indices, r: "" }))].sort((a, b) => a.i[0] - b.i[0]);
  let out = "";
  let cur = 0;
  for (const e of edits) {
    out += cps.slice(cur, e.i[0]).join("") + e.r;
    cur = e.i[1];
  }
  return (out + cps.slice(cur).join("")).trimEnd();
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fetch that answers every request with `body`, recording what was asked. */
function stubFetch(body: string, status = 200, type = "application/json") {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status, headers: { "content-type": type } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function stubImages() {
  const asked: Array<{ url: string; cap: number }> = [];
  const image = async (src: URL, _signal: AbortSignal, cap: number) => {
    asked.push({ url: src.toString(), cap });
    return "data:image/png;base64,AA==";
  };
  return { image, asked };
}

const signal = new AbortController().signal;

test("the quoted text is the post as typed, for every recorded quote", async () => {
  for (const id of ["2100298548843872339", "2100651092556333450", "2102784124830507151", "2102785196269731968"]) {
    const { fetch, calls } = stubFetch(fx(id));
    const r = await lookupQuote(id, signal, { fetch, image: stubImages().image });
    assert.equal(r.status, "ok", id);
    if (r.status !== "ok") continue;
    assert.equal(r.quote.text, typedText(id), id);
    assert.equal(r.quote.handle, "Postcheck_test");
    assert.equal(r.quote.badge, "blue");
    assert.equal(calls[0].url, `https://api.fxtwitter.com/status/${id}`);
    // A redirect from the fixed host is refused, never followed.
    assert.equal(calls[0].init?.redirect, "error");
  }
});

test("a quoted photo and poll come through; images only from X's CDN, within their caps", async () => {
  const photo = stubImages();
  const r = await lookupQuote("2102784124830507151", signal, { fetch: stubFetch(fx("2102784124830507151")).fetch, image: photo.image });
  assert.equal(r.status, "ok");
  if (r.status === "ok") assert.deepEqual(r.quote.photo && [r.quote.photo.width, r.quote.photo.height], [1600, 900]);
  assert.deepEqual(
    photo.asked.map((a) => [new URL(a.url).hostname, new URL(a.url).searchParams.get("name"), a.cap]),
    [
      ["abs.twimg.com", null, AVATAR_CAP],
      ["pbs.twimg.com", "medium", PHOTO_CAP],
    ],
  );
  const poll = await lookupQuote("2102785196269731968", signal, { fetch: stubFetch(fx("2102785196269731968")).fetch, image: stubImages().image });
  assert.equal(poll.status === "ok" && poll.quote.poll, true);
});

test("image URLs in FxTwitter's answer are never fetched off X's CDN", async () => {
  for (const bad of ["https://169.254.169.254/latest/meta-data", "http://pbs.twimg.com/a.jpg", "https://pbs.twimg.com.evil.example/a.jpg", "https://eviltwimg.com/a.jpg", "https://ton.twimg.com/a.jpg", "https://user@pbs.twimg.com/a.jpg", "https://pbs.twimg.com:8443/a.jpg", "file:///etc/passwd"]) {
    assert.equal(twimgUrl(bad), null, bad);
    const answer = JSON.parse(fx("2102784124830507151"));
    answer.tweet.author.avatar_url = bad;
    answer.tweet.media.photos[0].url = bad;
    const images = stubImages();
    const r = await lookupQuote("2102784124830507151", signal, { fetch: stubFetch(JSON.stringify(answer)).fetch, image: images.image });
    assert.equal(images.asked.length, 0, bad);
    assert.equal(r.status === "ok" && r.quote.avatar === null && r.quote.photo === null, true, bad);
  }
});

test("missing, protected and broken lookups are told apart", async () => {
  const image = stubImages().image;
  const status = async (body: string, code = 200, type?: string) => (await lookupQuote("2100298548843872339", signal, { fetch: stubFetch(body, code, type).fetch, image })).status;
  assert.equal(await status('{"code":404,"message":"NOT_FOUND","tweet":null}', 404), "unavailable");
  assert.equal(await status('{"code":401,"message":"PRIVATE_TWEET","tweet":null}', 401), "unavailable");
  assert.equal(await status('{"code":200,"message":"OK","tweet":null}'), "unavailable");
  // FxTwitter answers some unknown numbers with its HTML home page.
  assert.equal(await status("<!DOCTYPE html><html></html>", 200, "text/html"), "error");
  assert.equal(await status('{"code":500,"message":"API_FAIL"}', 500), "error");
  // An answer about a different post than the one asked for is not shown.
  assert.equal(await status(fx("2100651092556333450")), "error");
  assert.equal(await status(" ".repeat(300 * 1024)), "error");
  const throwing = (async () => {
    throw new Error("network");
  }) as unknown as typeof globalThis.fetch;
  assert.equal((await lookupQuote("2100298548843872339", signal, { fetch: throwing, image })).status, "error");
});

test("an answer of an unexpected shape is a failed lookup or a missing field, never a crash", async () => {
  const odd = JSON.parse(fx("2102784124830507151"));
  odd.tweet.author.avatar_url = { url: "https://pbs.twimg.com/a.jpg" };
  odd.tweet.media.photos = "none";
  odd.tweet.created_at = 12;
  const images = stubImages();
  const r = await lookupQuote("2102784124830507151", signal, { fetch: stubFetch(JSON.stringify(odd)).fetch, image: images.image });
  assert.equal(r.status, "ok");
  if (r.status === "ok") assert.deepEqual([r.quote.avatar, r.quote.photo, r.quote.createdAt], [null, null, ""]);
  assert.equal(images.asked.length, 0);
  const throwing = async () => {
    throw new Error("decode");
  };
  const failed = await lookupQuote("2102784124830507151", signal, { fetch: stubFetch(fx("2102784124830507151")).fetch, image: throwing });
  assert.equal(failed.status, "error");
});

test("a fetch with an allowlist refuses a redirect off the list", async () => {
  const asked: string[] = [];
  const redirecting: GuardFetch = async (url) => {
    asked.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://1.1.1.1/elsewhere.png" } });
  };
  // IP literals keep the public-address check off the network.
  const start = new URL("https://93.184.216.34/a.png");
  const onList = (u: URL) => u.hostname === "93.184.216.34";
  assert.equal(await fetchImageAsDataUrl(start, signal, 1024, onList, redirecting), null);
  assert.deepEqual(asked, ["https://93.184.216.34/a.png"]);
  await assert.rejects(guardedFetch(start, "image/*", signal, onList, redirecting), /host/);
});

test("the route takes a numeric id in its body and nothing it answers is cached", async () => {
  // Only digits may reach the FxTwitter URL; anything else is refused before any fetch.
  for (const body of ["", "{}", '{"id":""}', '{"id":"abc"}', '{"id":"12x"}', '{"id":"../20"}', `{"id":"${"1".repeat(21)}"}`, '{"id":20}', '{"u":"jack"}', "not json"]) {
    const res = await POST(new Request("https://postcheck.test/api/quote", { method: "POST", body }));
    assert.equal(res.status, 400, body);
    assert.equal(res.headers.get("cache-control"), "no-store", body);
  }
});

test("a status number is read only from a /status/ path", () => {
  assert.equal(statusId("https://x.com/Postcheck_test/status/2100298548843872339"), "2100298548843872339");
  assert.equal(statusId("https://twitter.com/jack/status/20?s=20"), "20");
  assert.equal(statusId("https://x.com/i/web/status/20/photo/1"), "20");
  assert.equal(statusId(`https://x.com/a/status/${"9".repeat(21)}`), null);
  // The number must be a whole path segment, and never come from the query or the fragment.
  assert.equal(statusId("https://x.com/a/status/123abc"), null);
  assert.equal(statusId("https://x.com/home?next=/status/123"), null);
  assert.equal(statusId("https://x.com/home#/status/123"), null);
  assert.equal(statusId("not a url /status/123"), null);
  // The same rule decides whether the link is a post link at all: anything else keeps its card.
  for (const [text, quote] of [
    ["see x.com/jack/status/20", true],
    ["see https://x.com/i/web/status/20/photo/1", true],
    ["see x.com/home?next=/status/123", false],
    ["see x.com/jack/status/123abc", false],
    ["see x.com/home#/status/123", false],
  ] as const) {
    assert.equal(quoteUrl(extractEntities(text)) !== undefined, quote, text);
  }
  assert.equal(statusId("https://x.com/jack"), null);
  assert.equal(statusId(undefined), null);
});

test("quote timestamps: seconds, minutes, hours, then date (web) or days (app)", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  for (const p of ["web", "app"] as const) {
    assert.equal(quoteTime(at(59 * S), now, p), "59s");
    assert.equal(quoteTime(at(60 * S), now, p), "1m");
    assert.equal(quoteTime(at(59 * M), now, p), "59m");
    assert.equal(quoteTime(at(23 * H + 59 * M), now, p), "23h");
  }
  const local = (iso: string) => new Date(iso);
  const sep16 = "2026-09-16T12:00:00Z";
  assert.equal(quoteTime(sep16, now, "web"), `Sep ${local(sep16).getDate()}`);
  assert.equal(quoteTime(at(D), now, "app"), "1d");
  assert.equal(quoteTime(at(7 * D - S), now, "app"), "6d");
  const week = at(7 * D);
  assert.equal(quoteTime(week, now, "app"), `${local(week).getMonth() + 1}/${local(week).getDate()}/26`);
  const lastYear = "2025-09-16T12:00:00Z";
  assert.equal(quoteTime(lastYear, now, "web"), `Sep ${local(lastYear).getDate()}, 2025`);
  assert.equal(quoteTime("not a date", now, "web"), "");
});

test("a profile falls back to vxtwitter when FxTwitter has no user, and only both saying none means no account", async () => {
  // FxTwitter's user endpoint answered "User not found" for real accounts, in bursts, on 2026-10-08.
  const stub = (fx: number | "throw", vx: number | "throw", vxName = "Postcheck_test") => {
    const asked: string[] = [];
    const f: GuardFetch = async (url) => {
      asked.push(url.origin);
      const fromFx = url.origin === "https://api.fxtwitter.com";
      const code = fromFx ? fx : vx;
      if (code === "throw") throw new Error("network");
      const body = code !== 200 ? { code, message: "User not found" } : fromFx
        ? { code, user: { screen_name: "Postcheck_test", name: "Postcheck", verification: { verified: true, type: "individual" } } }
        : { screen_name: vxName, name: "Postcheck", profile_image_url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg" };
      return new Response(JSON.stringify(body), { status: code });
    };
    return { f, asked };
  };
  const ok = stub(200, 200);
  const first = await lookupProfile("postcheck_test", signal, ok.f);
  assert.ok(first.user && "verified" in first && first.verified);
  assert.deepEqual(ok.asked, ["https://api.fxtwitter.com"]);

  const flaky = stub(404, 200);
  const fell = await lookupProfile("Postcheck_test", signal, flaky.f);
  assert.equal(fell.user?.screen_name, "Postcheck_test");
  assert.ok("verified" in fell && fell.verified === false);
  assert.equal(fell.user?.avatar_url, "https://pbs.twimg.com/profile_images/1/a_normal.jpg");
  assert.deepEqual(flaky.asked, ["https://api.fxtwitter.com", "https://api.vxtwitter.com"]);

  assert.deepEqual(await lookupProfile("nobody_here_x", signal, stub(404, 404).f), { user: null, missing: true });
  // One side unreachable: a failed lookup, not "no account".
  assert.deepEqual(await lookupProfile("nobody_here_x", signal, stub(404, "throw").f), { user: null, missing: false });
  assert.equal((await lookupProfile("Postcheck_test", signal, stub("throw", 200).f)).user?.screen_name, "Postcheck_test");
  // An answer for a different account is no answer.
  assert.deepEqual(await lookupProfile("Postcheck_test", signal, stub(404, 200, "someone_else").f), { user: null, missing: false });
});
