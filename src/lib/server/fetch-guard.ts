import { lookup, type LookupAddress, type LookupOptions } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Server-side fetch helpers shared by the API routes. Every outbound request
 * is http(s) only, to a public address (re-checked on every redirect hop, and at
 * connect time on the address actually dialled), byte-capped and abortable.
 */
export const HTML_CAP = 2 * 1024 * 1024; // YouTube puts its og tags past 700KB of inline script
export const IMAGE_CAP = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 4;
export const UA = "Mozilla/5.0 (compatible; Postcheck/1.0; +https://github.com/Vibewatch-io/postcheck)";

/**
 * Addresses a fetch may never reach. node:net's BlockList checks an IPv4-mapped address
 * (`::ffff:7f00:1` is 127.0.0.1, which a dotted-decimal parser missed) against the IPv4 rules, so
 * `::ffff:0:0/96` must not be listed: BlockList maps every IPv4 address into it. The translated and
 * IPv4-compatible ranges are refused, as are the well-known NAT64 prefixes, 6to4 and Teredo, which embed
 * an IPv4 address a gateway may forward to.
 */
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 96], ["::ffff:0:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  // 2001::/23 is IETF protocol space: Teredo (2001::/32, embeds an IPv4 client), benchmarking, ORCHID.
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(net, bits, "ipv6");

/** True for an address a fetch may connect to. Anything unparseable counts as private. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  try {
    return !BLOCKED.check(address, family === 6 ? "ipv6" : "ipv4");
  } catch {
    return false;
  }
}

/**
 * The URL-level checks, run before every hop: scheme, port, credentials, local names, and an IP
 * literal's address. A hostname is checked when the connection resolves it (checkedLookup), so the
 * address checked is the address dialled: a second, separate lookup could be answered differently
 * (DNS rebinding).
 */
export function assertPublic(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  if (url.username || url.password) throw new Error("credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("host");
  }
  if (isIP(host) && !isPublicAddress(host)) throw new Error("private");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Resolver = (hostname: string, options: LookupOptions & { all: true }, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

/**
 * dns.lookup for the connection itself: refuses the host if any address it resolves to is private,
 * and hands the socket only addresses it checked.
 */
export function checkedLookup(resolve: Resolver = lookup) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      if (addresses.length === 0) return callback(Object.assign(new Error("dns"), { code: "ENOTFOUND" }), []);
      if (addresses.some((a) => !isPublicAddress(a.address))) {
        return callback(Object.assign(new Error("private"), { code: "EPRIVATE" }), []);
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const PINNED = new Agent({ connect: { lookup: checkedLookup() } });

/** The fetch every guarded hop goes through: undici's own, so it can carry the checking dispatcher. */
export type GuardFetch = (url: URL, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
const pinnedFetch: GuardFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: PINNED }) as unknown as Promise<Response>;

/** Ends a response nobody will read, so its connection doesn't outlive the request. */
export function discard(res: Pick<Response, "body">): void {
  void res.body?.cancel().catch(() => {});
}

/** The body's first `cap` bytes, the chunk that crosses the cap included up to it; the rest is never read. */
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
      chunks.push(value.subarray(0, value.byteLength - (total - cap)));
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
export async function guardedFetch(
  start: URL,
  accept: string,
  signal: AbortSignal,
  allow?: (url: URL) => boolean,
  fetchImpl: GuardFetch = pinnedFetch,
): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (allow && !allow(url)) throw new Error("host");
    assertPublic(url);
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": UA, accept, "accept-language": "en" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      discard(res);
      if (!loc) throw new Error("redirect");
      url = new URL(loc, url);
      continue;
    }
    return { res, url };
  }
  throw new Error("too many redirects");
}

/** Fetches an image and returns it as a data URL, or null on any failure, past `cap` bytes, or off `allow`. */
export async function fetchImageAsDataUrl(
  src: URL,
  signal: AbortSignal,
  cap = IMAGE_CAP,
  allow?: (url: URL) => boolean,
  fetchImpl?: GuardFetch,
): Promise<string | null> {
  try {
    const { res } = await guardedFetch(src, "image/*", signal, allow, fetchImpl);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const declared = Number(res.headers.get("content-length") || 0);
    if (!res.ok || !/^image\/(png|jpeg|jpg|webp|gif|avif)$/.test(type) || declared > cap) {
      discard(res);
      return null;
    }
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
