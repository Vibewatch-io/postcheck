import { NO_STORE, readJsonBody } from "@/lib/server/fetch-guard";
import { CHECK_BODY_CAP, CHECK_BODY_TIMEOUT_MS, authorize, runCheck } from "@/lib/server/check";
import { MCP_VERSIONS, handleMcp } from "@/lib/server/mcp";
import { sameOrigin } from "@/lib/server/same-origin";

/**
 * POST /api/mcp: Postcheck as a remote MCP server (Streamable HTTP, stateless, JSON answers): add it to
 * Claude or any MCP client by URL. Same access as /api/check: open behind the /api/ rate limit, or with
 * a bearer key. Like /api/check, the text is used for one answer and never stored or logged.
 */
export const runtime = "nodejs";

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, "content-type": "application/json", ...extra } });

/** No server-sent stream and no sessions: only POST. */
const postOnly = () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } });
export const GET = postOnly;
export const DELETE = postOnly;

export async function POST(request: Request) {
  // A web page may not drive this server from someone's browser (MCP's transport rules).
  if (request.headers.has("origin") && !sameOrigin(request)) return json({ error: "origin not allowed" }, 403);
  if (authorize(request) === "denied") return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unknown API key" } }, 401, { "www-authenticate": "Bearer" });
  const version = request.headers.get("mcp-protocol-version");
  if (version && !MCP_VERSIONS.includes(version)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `unsupported MCP-Protocol-Version ${version}` } }, 400);
  const body = await readJsonBody(request, CHECK_BODY_CAP, CHECK_BODY_TIMEOUT_MS);
  if (body === undefined) return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);
  // One message per request (MCP 2025-06-18 dropped batches): a batch of checks would be many lookups
  // and layouts for one request the rate limit counts once.
  if (Array.isArray(body)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "send one JSON-RPC message per request" } }, 400);
  const answer = await handleMcp(body, { run: runCheck });
  return answer ? json(answer) : new Response(null, { status: 202, headers: NO_STORE });
}
