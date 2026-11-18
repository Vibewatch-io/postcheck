// The hosted check: /api/check and /api/mcp, the request validation, the key, the lookups and the MCP
// protocol. No network: lookups are stubbed, and posts without links make none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize, parseCheckRequest, runCheck, type LookupDeps } from "../src/lib/server/check";
import { handleMcp } from "../src/lib/server/mcp";
import * as check from "../src/app/api/check/route";
import * as mcp from "../src/app/api/mcp/route";

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("a check request is refused with a reason for every malformed field", () => {
  const bad: unknown[] = [
    null,
    [],
    {},
    { text: 1 },
    { text: "x".repeat(25_001) },
    { text: "hi", badge: "purple" },
    { text: "hi", phone: "web" },
    { text: "hi", web: "iphone-17" },
    { text: "hi", devices: ["nope"] },
    { text: "hi", media: [{ kind: "photo", width: 0, height: 10 }] },
    { text: "hi", media: Array(5).fill({ kind: "photo", width: 1, height: 1 }) },
    { text: "hi", poll: ["only one"] },
    { text: "hi", poll: ["a", "x".repeat(26)] },
    { text: "hi", poll: ["a", "b"], media: [{ kind: "photo", width: 1, height: 1 }] },
    { text: "   " },
  ];
  for (const b of bad) assert.ok("error" in parseCheckRequest(b), JSON.stringify(b)?.slice(0, 60));
  const ok = parseCheckRequest({ text: "hi", badge: "blue", phone: "galaxy-s25", web: "web-post", devices: ["web"], poll: ["a", "b"] });
  assert.ok(!("error" in ok));
});

// A wrong key must never pass as the public tier, or it would dodge the per-IP limit the key is exempt from.
test("only the exact key is keyed; a wrong or malformed one is refused, not treated as public", () => {
  const req = (h?: string) => new Request("http://localhost/api/check", { method: "POST", headers: h === undefined ? {} : { authorization: h } });
  assert.equal(authorize(req(), "s3cret"), "public");
  assert.equal(authorize(req("Bearer s3cret"), "s3cret"), "key");
  assert.equal(authorize(req("Bearer nope"), "s3cret"), "denied");
  assert.equal(authorize(req("s3cret"), "s3cret"), "denied");
  assert.equal(authorize(req("Bearer s3cret"), undefined), "denied");
});

const card = { url: "https://example.com/", host: "example.com", title: "Example", description: "", image: null, layout: "large" as const };
const stub = (over: Partial<LookupDeps>): LookupDeps => ({ unfurl: async () => ({ card }), quote: async () => ({ status: "unavailable" }), ...over });

test("a card that shows hides the trailing link's text; one that can't be read keeps it and says so", async () => {
  const req = parseCheckRequest({ text: "Read the write-up https://example.com", devices: ["web"] });
  assert.ok(!("error" in req));
  const shown = await runCheck(req, stub({}));
  assert.deepEqual(shown.devices[0].lines, ["Read the write-up"]);
  assert.equal(shown.fidelity, "exact");
  const unknown = await runCheck(req, stub({ unfurl: async () => { throw new Error("timeout"); } }));
  assert.deepEqual(unknown.devices[0].lines, ["Read the write-up example.com"]);
  assert.equal(unknown.fidelity, "approximate");
  assert.match(unknown.notes.join(" "), /couldn't be read/);
});

test("MCP: initialize negotiates the version, notifications get no answer, errors keep the request id", async () => {
  const ctx = { run: async () => { throw new Error("not called"); } };
  const init = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ctx)) as { result: { protocolVersion: string } };
  assert.equal(init.result.protocolVersion, "2025-03-26");
  const future = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, ctx)) as { result: { protocolVersion: string } };
  assert.equal(future.result.protocolVersion, "2025-06-18");
  assert.equal(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
  assert.deepEqual(await handleMcp({ jsonrpc: "2.0", id: 3, method: "nope" }, ctx), { jsonrpc: "2.0", id: 3, error: { code: -32601, message: "method not found: nope" } });
  assert.equal(((await handleMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, ctx)) as { error: { code: number } }).error.code, -32602);
  assert.equal(((await handleMcp({ id: 5, method: "ping" }, ctx)) as { error: { code: number } }).error.code, -32600);
});

test("MCP: check_post runs the check, and a bad argument comes back as a tool error the model can read", async () => {
  const tools = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { run: runCheck })) as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(tools.result.tools.map((t) => t.name), ["check_post", "list_devices"]);
  const call = (args: unknown) => handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_post", arguments: args } }, { run: (r) => runCheck(r, stub({})) });
  const good = (await call({ text: "@vibewatch is live", devices: ["web"] })) as { result: { content: Array<{ text: string }>; isError?: boolean } };
  assert.equal(good.result.isError, undefined);
  assert.match(good.result.content[0].text, /^NEEDS A FIX/);
  assert.match(good.result.content[0].text, /Opens with @vibewatch/);
  const bad = (await call({ text: "hi", badge: "purple" })) as { result: { isError: boolean } };
  assert.equal(bad.result.isError, true);
});

test("/api/check answers a check, refuses a bad body and a bad key, and keeps nothing cacheable", async () => {
  const ok = await check.POST(post("http://localhost/api/check", { text: "Just a short post.", devices: ["web"] }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const json = (await ok.json()) as { ok: boolean; devices: Array<{ lines: string[] }> };
  assert.equal(json.ok, true);
  assert.deepEqual(json.devices[0].lines, ["Just a short post."]);
  assert.equal((await check.POST(post("http://localhost/api/check", "{not json"))).status, 400);
  assert.equal((await check.POST(post("http://localhost/api/check", { text: "hi" }, { authorization: "Bearer wrong" }))).status, 401);
  assert.equal(check.GET().status, 405);
});

test("/api/mcp refuses other origins and unknown protocol versions, and answers a notification with 202", async () => {
  const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } };
  assert.equal((await mcp.POST(post("https://postcheck.vibewatch.io/api/mcp", init, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await mcp.POST(post("https://postcheck.vibewatch.io/api/mcp", init, { "mcp-protocol-version": "1999-01-01" }))).status, 400);
  assert.equal((await mcp.POST(post("https://postcheck.vibewatch.io/api/mcp", { jsonrpc: "2.0", method: "notifications/initialized" }))).status, 202);
  const res = await mcp.POST(post("https://postcheck.vibewatch.io/api/mcp", init));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name, "postcheck");
  assert.equal(mcp.GET().status, 405);
});

// One rate-limited request must not fan out into many checks (and many outside lookups).
test("/api/mcp refuses a batch instead of running every check in it", async () => {
  const call = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "check_post", arguments: { text: `go https://example.com/${id}` } } });
  const res = await mcp.POST(post("https://postcheck.vibewatch.io/api/mcp", [call(1), call(2)]));
  assert.equal(res.status, 400);
});

// A JSON-RPC response (result or error, no method) is acknowledged, not answered with an error.
test("MCP: a response message gets no answer", async () => {
  const ctx = { run: async () => { throw new Error("not called"); } };
  assert.equal(await handleMcp({ jsonrpc: "2.0", id: 7, result: {} }, ctx), null);
  assert.equal(await handleMcp({ jsonrpc: "2.0", id: 8, error: { code: 1, message: "x" } }, ctx), null);
});

// X posts media alone; and a 25,000-character post fits even when the client escapes every character.
test("a media-only post is checked, and an escaped 25,000-character body fits the cap", async () => {
  assert.ok(!("error" in parseCheckRequest({ text: "", media: [{ kind: "photo", width: 1600, height: 900 }] })));
  const escaped = '{"text":"' + "\\u0416".repeat(25_000) + '","devices":["web"]}';
  assert.ok(escaped.length > 150_000);
  const res = await check.POST(post("http://localhost/api/check", escaped));
  assert.equal(res.status, 200);
});
