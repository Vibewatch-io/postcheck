import { createHash, timingSafeEqual } from "node:crypto";
import { BADGES, checkPost, linksOf, type Badge, type CheckOptions, type CheckResult, type Draft, type Lookups } from "@/lib/check";
import { DEVICES } from "@/lib/devices";
import type { QuoteResult } from "@/lib/quote";
import { lookupQuote } from "./fxtwitter";
import { unfurl } from "./unfurl";

/**
 * The hosted check (POST /api/check and the MCP tool check_post): validates a request, makes the two
 * lookups the site would make (the card's page, the quoted post), and runs checkPost. The text is held
 * only for the request: nothing here logs or stores it.
 */

/**
 * Largest request body: a 25,000-character post (X's longest) is 75KB of UTF-8, but up to 150KB once a
 * JSON encoder escapes every non-ASCII character as \uXXXX (Python's json.dumps does), plus the rest.
 */
export const CHECK_BODY_CAP = 192 * 1024;
export const CHECK_BODY_TIMEOUT_MS = 5000;
/** The longest post X takes (Premium). */
const MAX_TEXT = 25_000;
const LOOKUP_TIMEOUT_MS = 6000;
const MEDIA_KINDS = ["photo", "gif", "video"] as const;

export interface CheckRequest {
  draft: Draft;
  opts: CheckOptions;
}

/** A request body as the API and the MCP tool take it, or what is wrong with it. */
export function parseCheckRequest(body: unknown): CheckRequest | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "send a JSON object with a text field" };
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return { error: "text must be a string" };
  if (b.text.length > MAX_TEXT) return { error: `text is longer than X's ${MAX_TEXT.toLocaleString("en")} characters` };
  if (b.plain !== undefined && typeof b.plain !== "boolean") return { error: "plain must be true or false" };
  if (b.badge !== undefined && !BADGES.includes(b.badge as Badge)) return { error: `badge must be one of ${BADGES.join(", ")}` };
  const byId = new Map(DEVICES.map((d) => [d.id, d]));
  if (b.phone !== undefined && (typeof b.phone !== "string" || byId.get(b.phone)?.kind !== "phone")) return { error: "phone must be a phone's device id (list_devices)" };
  if (b.web !== undefined && (typeof b.web !== "string" || !byId.has(b.web) || byId.get(b.web)?.kind === "phone")) return { error: "web must be a web view's device id (list_devices)" };
  if (b.devices !== undefined && (!Array.isArray(b.devices) || b.devices.length > DEVICES.length || b.devices.some((id) => typeof id !== "string" || !byId.has(id)))) {
    return { error: "devices must be a list of device ids (list_devices)" };
  }
  let media: Draft["media"];
  if (b.media !== undefined) {
    if (!Array.isArray(b.media) || b.media.length > 4) return { error: "media is a list of up to 4 items" };
    media = [];
    for (const m of b.media as unknown[]) {
      const item = m && typeof m === "object" ? (m as Record<string, unknown>) : null;
      const ok = item && MEDIA_KINDS.includes(item.kind as (typeof MEDIA_KINDS)[number]) && [item.width, item.height].every((v) => typeof v === "number" && v > 0 && v <= 20_000);
      if (!ok) return { error: "each media item needs kind (photo, gif or video) and width and height in pixels" };
      media.push({ kind: item.kind as (typeof MEDIA_KINDS)[number], width: item.width as number, height: item.height as number });
    }
  }
  let poll: Draft["poll"];
  if (b.poll !== undefined) {
    if (!Array.isArray(b.poll) || b.poll.length < 2 || b.poll.length > 4 || b.poll.some((c) => typeof c !== "string" || c.length > 25)) {
      return { error: "poll is a list of 2 to 4 choices of up to 25 characters" };
    }
    poll = b.poll as string[];
  }
  if (media?.length && poll) return { error: "X takes media or a poll, not both" };
  // X posts media alone; a poll needs its question, which the tips then ask for.
  if (!b.text.trim() && !poll && !media?.length) return { error: "text is empty" };
  return {
    draft: { text: b.text, plain: b.plain as boolean | undefined, media, poll },
    opts: { badge: b.badge as Badge | undefined, phone: b.phone as string | undefined, web: b.web as string | undefined, devices: b.devices as string[] | undefined },
  };
}

export interface CheckResponse extends CheckResult {
  /** "exact": every line was measured in X's font and every lookup answered; otherwise "approximate", with `notes` saying why. */
  fidelity: "exact" | "approximate";
  notes: string[];
}

export interface LookupDeps {
  unfurl: typeof unfurl;
  quote: (id: string, signal: AbortSignal) => Promise<QuoteResult>;
}

const DEFAULT_DEPS: LookupDeps = {
  unfurl,
  // The embed's avatar and photo aren't needed to check a post: skip the image fetches.
  quote: (id, signal) => lookupQuote(id, signal, { image: async () => null }),
};

/** The lookups the draft needs, made the way the site makes them; anything that doesn't answer is "unknown". */
export async function lookupsFor(draft: Draft, deps: LookupDeps = DEFAULT_DEPS, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<Lookups> {
  const { cardUrl, quoteId } = linksOf(draft);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const [card, quote] = await Promise.all([
      cardUrl
        ? deps
            .unfurl(cardUrl, controller.signal, { image: false })
            .then((a): Lookups["card"] => (!a ? "failed" : a.card ? a.card : a.reason))
            .catch((): Lookups["card"] => "unknown")
        : undefined,
      quoteId
        ? deps
            .quote(quoteId, controller.signal)
            .then((r): Lookups["quote"] => (r.status === "ok" ? "found" : r.status === "unavailable" ? "unavailable" : "unknown"))
            .catch((): Lookups["quote"] => "unknown")
        : undefined,
    ]);
    return { card, quote };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** A whole hosted check: lookups, then the layout and tips, then how sure the answer is. */
export async function runCheck(req: CheckRequest, deps?: LookupDeps): Promise<CheckResponse> {
  const lookups = await lookupsFor(req.draft, deps);
  const result = checkPost(req.draft, lookups, req.opts);
  const notes: string[] = [];
  const fallback = result.devices.filter((d) => d.approximate).map((d) => d.label);
  if (fallback.length) {
    const where = fallback.length === result.devices.length ? "every device" : fallback.join(", ");
    notes.push(`Some characters aren't in X's font (emoji, CJK, Thai, Arabic…), so line breaks on ${where} are estimates: each reader's phone draws them in its own fonts.`);
  }
  if (lookups.card === "unknown" || lookups.card === "failed") notes.push("The link's page couldn't be read, so whether X shows a card (and hides the link text) is unknown; the lines keep the link text.");
  if (lookups.quote === "unknown") notes.push("The quoted post couldn't be looked up; the layout assumes X shows the quote.");
  return { ...result, fidelity: notes.length ? "approximate" : "exact", notes };
}

/**
 * Who is calling: no Authorization header is the public tier (behind the site's per-IP rate limit);
 * a bearer key must match POSTCHECK_API_KEY exactly, which the firewall exempts from that limit. A
 * header that is present but wrong is refused, so it can never be used to dodge the shared limit.
 * Without POSTCHECK_API_KEY set, every keyed call is refused and the public tier works as before.
 */
export function authorize(request: Request, key: string | undefined = process.env.POSTCHECK_API_KEY): "public" | "key" | "denied" {
  const header = request.headers.get("authorization");
  if (header === null) return "public";
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];
  if (!token || !key) return "denied";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(token), digest(key)) ? "key" : "denied";
}
