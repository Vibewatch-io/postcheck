import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-side fetch helpers shared by the API routes. Every outbound request
 * is http(s) only, to a public address (re-checked on every redirect hop),
 * byte-capped and abortable.
 */
export const HTML_CAP = 2 * 1024 * 1024; // YouTube puts its og tags past 700KB of inline script
export const IMAGE_CAP = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 4;
export const UA = "Mozilla/5.0 (compatible; Postcheck/1.0; +https://github.com/Vibewatch-io/postcheck)";

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true;
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true;
  if (s.startsWith("::ffff:")) return isPrivateIPv4(s.slice(7));
  return false;
}

export async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  if (url.username || url.password) throw new Error("credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("host");
  }
  const ips = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (ips.length === 0) throw new Error("dns");
  for (const { address, family } of ips) {
    if (family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address)) throw new Error("private");
  }
}

export async function readCapped(res: Pick<Response, "body">, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(total, cap));
  let off = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.byteLength, out.byteLength - off));
    out.set(slice, off);
    off += slice.byteLength;
    if (off >= out.byteLength) break;
  }
  return out;
}

/**
 * fetch() with manual redirects so every hop is re-validated: public addresses only, and when
 * `allow` is given, only the URLs it accepts (an allowlisted host can't redirect off the list).
 */
export async function guardedFetch(start: URL, accept: string, signal: AbortSignal, allow?: (url: URL) => boolean): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (allow && !allow(url)) throw new Error("host");
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": UA, accept, "accept-language": "en" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect");
      await res.body?.cancel();
      url = new URL(loc, url);
      continue;
    }
    return { res, url };
  }
  throw new Error("too many redirects");
}

/** Fetches an image and returns it as a data URL, or null on any failure, past `cap` bytes, or off `allow`. */
export async function fetchImageAsDataUrl(src: URL, signal: AbortSignal, cap = IMAGE_CAP, allow?: (url: URL) => boolean): Promise<string | null> {
  try {
    const { res } = await guardedFetch(src, "image/*", signal, allow);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !/^image\/(png|jpeg|jpg|webp|gif|avif)$/.test(type)) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > cap) return null;
    const bytes = await readCapped(res, cap + 1);
    if (bytes.byteLength > cap) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The lookups carry something a person typed (a link from their post, a handle), so no cache between
 * us and them may keep the answer: the footer promises we never store what you write. The browser
 * keeps fetched cards for the session instead.
 */
export const NO_STORE: HeadersInit = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** Largest lookup body accepted: a JSON object holding one link of up to 2048 UTF-16 units (at most
 *  3 bytes each in UTF-8, so 6144) plus the JSON around it, or a handle. */
const LOOKUP_BODY_CAP = 8192;
/** A lookup body is a few hundred bytes; one still arriving after this is abandoned. */
const LOOKUP_BODY_TIMEOUT_MS = 5000;

/** The lookups take a POST body only. A stray GET (say, an old link with the URL or handle in its
 *  address) gets a 405 that no cache keeps. */
export function postOnly(): Response {
  return new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } });
}

/**
 * Reads one string field from a small JSON request body. The lookups take their input in the body,
 * never the address, because addresses end up in request logs and caches and bodies don't.
 */
export async function readLookupField(request: Request, field: string): Promise<string | null> {
  if (Number(request.headers.get("content-length") || 0) > LOOKUP_BODY_CAP) return null;
  // A body that breaks off or stalls mid-upload is a bad request (400), not an unhandled error, and
  // never holds the function open: past the deadline the stream is cancelled, which ends the read.
  const body = request.body;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bytes: Uint8Array;
  try {
    bytes = await Promise.race([
      readCapped(request, LOOKUP_BODY_CAP + 1),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("lookup body timed out")), LOOKUP_BODY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    void body?.cancel().catch(() => {});
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (bytes.byteLength > LOOKUP_BODY_CAP) return null;
  try {
    const value = (JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown> | null)?.[field];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
