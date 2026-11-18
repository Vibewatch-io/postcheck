import { deviceList } from "@/lib/check";
import { parseCheckRequest, type CheckRequest, type CheckResponse } from "./check";

/**
 * Postcheck as a remote MCP server (POST /api/mcp, Streamable HTTP in stateless JSON mode): one
 * JSON-RPC message in, one answer out, no session and no server-sent stream. Two tools: check_post
 * (the hosted check) and list_devices. This module is the protocol alone, so it is tested without Next.
 */

/** Protocol versions answered, newest first: a client asking for one of these gets it back. */
export const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SEVERITY = { fix: "FIX", tip: "TIP", note: "NOTE" } as const;

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The post exactly as it will be typed into X. **bold** and __italic__ mark Premium styling unless plain is set." },
    plain: { type: "boolean", description: "Take ** and __ literally instead of as styling markers." },
    badge: { type: "string", enum: ["none", "blue", "gold", "gray"], description: "The posting account's check mark (default none). Any check can post past 280 characters." },
    phone: { type: "string", description: "The phone the tips cover (default iphone-17, the most common width). See list_devices." },
    web: { type: "string", description: "The web view the tips cover (default web, the x.com timeline)." },
    devices: { type: "array", items: { type: "string" }, description: "Devices to report line breaks for (default: the x.com timeline and every phone's timeline)." },
    media: {
      type: "array",
      maxItems: 4,
      description: "Attached media by kind and pixel size (no file needed). X shows it instead of any link card.",
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: ["photo", "gif", "video"] }, width: { type: "number" }, height: { type: "number" } },
        required: ["kind", "width", "height"],
      },
    },
    poll: { type: "array", items: { type: "string", maxLength: 25 }, minItems: 2, maxItems: 4, description: "A text poll's choices." },
    format: { type: "string", enum: ["text", "json"], description: "text (default): a readable report. json: the whole result." },
  },
  required: ["text"],
};

const TOOLS = [
  {
    name: "check_post",
    title: "Check an X post",
    description:
      "Check a draft X post before it goes out. Returns what Postcheck's tips say (severity fix = X will do something you'll want to fix, " +
      "tip = worth changing, note = worth knowing) and, for each device, the lines a reader sees before Show more, where it folds and any " +
      "word left alone on a line. Line breaks come from X's own font metrics and are checked against X's captures. ok is false when a tip is a fix.",
    inputSchema: CHECK_SCHEMA,
  },
  {
    name: "list_devices",
    title: "List Postcheck devices",
    description: "The device ids check_post takes for phone, web and devices.",
    inputSchema: { type: "object", properties: {} },
  },
];

export interface McpContext {
  run: (req: CheckRequest) => Promise<CheckResponse>;
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const result = (id: unknown, value: unknown) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message: its answer, or null for a notification or a response (nothing to say back). */
export async function handleMcp(message: unknown, ctx: McpContext): Promise<object | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return failure(null, -32600, "invalid request");
  const { jsonrpc, id, method, params } = message as Rpc;
  const isRequest = id !== undefined && id !== null;
  if (jsonrpc !== "2.0") return failure(id, -32600, "invalid request");
  // A response (result or error, no method) is acknowledged with 202 like a notification.
  if (typeof method !== "string") return "result" in (message as object) || "error" in (message as object) ? null : failure(id, -32600, "invalid request");
  if (!isRequest) return null; // notifications/initialized, notifications/cancelled, …
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  switch (method) {
    case "initialize": {
      const asked = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return result(id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "postcheck", title: "Postcheck", version: "1.0.0" },
        instructions:
          "Call check_post with a draft before it is posted on X: it reports what X will do to it (Show more cuts, the app's line fold, dangling words, " +
          "link cards, reply-like openings, hashtag piles, length) from Postcheck's measured renderer.",
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS });
    case "tools/call": {
      const args = p.arguments && typeof p.arguments === "object" ? (p.arguments as Record<string, unknown>) : {};
      if (p.name === "list_devices") return result(id, { content: [{ type: "text", text: formatDevices() }] });
      if (p.name !== "check_post") return failure(id, -32602, `unknown tool: ${String(p.name)}`);
      const { format, ...body } = args;
      const req = parseCheckRequest(body);
      // A bad argument is the tool's answer, so the caller's model reads why and can try again.
      if ("error" in req) return result(id, { content: [{ type: "text", text: `Can't check that: ${req.error}.` }], isError: true });
      try {
        const out = await ctx.run(req);
        return result(id, { content: [{ type: "text", text: format === "json" ? JSON.stringify(out, null, 2) : formatReport(out) }] });
      } catch {
        return result(id, { content: [{ type: "text", text: "Postcheck couldn't check the post. Try again." }], isError: true });
      }
    }
    default:
      return failure(id, -32601, `method not found: ${method}`);
  }
}

/** The device ids, one per line. */
export function formatDevices(): string {
  return deviceList()
    .map((d) => `${d.id}: ${d.label} (${d.platform}, ${d.page}${d.platform === "web" ? "" : `, ${d.width}pt wide`})`)
    .join("\n");
}

/** A check as plain text: the verdict, the tips, then each distinct layout once with the devices that share it. */
export function formatReport(r: CheckResponse): string {
  const out: string[] = [];
  const attachment =
    r.attachment?.type === "card"
      ? r.attachment.card
        ? `, a ${r.attachment.card.layout} link card for ${r.attachment.card.host}`
        : r.attachment.reason === "none"
          ? ", a link X shows no card for"
          : ", a link whose card couldn't be checked"
      : r.attachment?.type === "quote"
        ? r.attachment.found === false
          ? ", a link to a post that isn't there"
          : ", a quote post"
        : r.attachment?.type === "media"
          ? `, ${r.attachment.kinds.length} media item${r.attachment.kinds.length === 1 ? "" : "s"}`
          : r.attachment?.type === "poll"
            ? ", a poll"
            : "";
  out.push(`${r.ok ? "OK" : "NEEDS A FIX"}: ${r.length.weighted}/${r.length.limit} characters${attachment}.${r.fidelity === "exact" ? "" : " Some line breaks are estimates:"}`);
  for (const n of r.notes) out.push(`- ${n}`);
  out.push("", r.advice.length ? `Tips (as the site shows them for ${r.previews.join(" and ")}):` : `No tips for ${r.previews.join(" and ")}.`);
  for (const a of r.advice) out.push(`- [${SEVERITY[a.severity]}] ${a.title}: ${a.detail}`);
  const groups = new Map<string, { lines: string[]; showMore: boolean; dangling: string[]; labels: string[] }>();
  for (const d of r.devices) {
    const key = JSON.stringify([d.lines, d.showMore, d.dangling]);
    const g = groups.get(key) ?? { lines: d.lines, showMore: d.showMore, dangling: d.dangling, labels: [] };
    g.labels.push(d.label);
    groups.set(key, g);
  }
  out.push("", "What each device shows before any tap (an empty line is a paragraph gap):");
  for (const g of groups.values()) {
    // A word can dangle in a paragraph behind Show more: it shows once the post is opened.
    const dangling = g.dangling.map((w) => (g.lines.includes(w) ? `"${w}"` : `"${w}" (after Show more)`));
    out.push("", `${g.labels.join(", ")}: ${g.lines.length} lines, ${g.showMore ? "then Show more" : "the whole post"}${dangling.length ? `; dangling: ${dangling.join(", ")}` : ""}`);
    g.lines.forEach((line, i) => out.push(`${String(i + 1).padStart(3)} | ${line}`));
    if (g.showMore) out.push("    | … Show more");
  }
  return out.join("\n");
}
