import type { StyleRun } from "./entities";
import { DEFAULT_PHONE_ID, DEVICES } from "./devices";
import { POLL_CHOICE_MAX, POLL_MAX_CHOICES, POLL_MAX_MINUTES, POLL_MIN_CHOICES, POLL_MIN_MINUTES, type Poll } from "./poll";

/**
 * Share links. The whole preview (text, styling, identity, shrunk images, device, theme) is
 * compressed into the link's fragment (`#s=…`). Browsers never send a fragment to a server, so
 * nothing is stored or uploaded: the link is the preview. Whoever holds the link can read it.
 */

export const SHARE_PREFIX = "#s=";
/** Longest link Share will make: under Slack's 40,000-character message limit. */
export const SHARE_LINK_BUDGET = 38_000;
/** Longest fragment a shared page will read, and the most JSON it will inflate from it. */
const MAX_FRAGMENT = 64_000;
const MAX_JSON_BYTES = 512_000;
/** X's own ceiling for a Premium post, in UTF-16 units with room to spare. Share refuses longer
 *  text rather than make a link the shared page would reject. */
export const SHARE_MAX_TEXT = 30_000;
const MAX_STYLE_RUNS = 2_000;
/** Shared images are JPEGs Share made itself; anything bigger than these was not. */
const MAX_IMAGE_BYTES = 200_000;
const MAX_IMAGE_EDGE = 2_048;

const BADGES = ["none", "blue", "gold", "gray"] as const;
const THEMES = ["light", "dark"] as const;
const PHONE_IDS = new Set(DEVICES.filter((d) => d.kind === "phone").map((d) => d.id));
const WEB_IDS = new Set(DEVICES.filter((d) => d.kind !== "phone").map((d) => d.id));

export interface SharedPreview {
  text: string;
  styles: StyleRun[];
  identity: { name: string; handle: string; badge: (typeof BADGES)[number]; avatar: string | null };
  media: string | null;
  poll: Poll | null;
  theme: (typeof THEMES)[number];
  /** Device ids: a phone for the Mobile view, a web layout for the Web view. */
  phone: string;
  web: string;
  view: "app" | "web";
}

/**
 * Wire format v1. Style runs travel as [start, end, flags] with bold = 1, italic = 2. A poll is
 * optional, so links made before polls existed still open: its choices and minutes. The composer
 * makes text polls only, so no pictures travel.
 */
interface Wire {
  v: 1;
  text: string;
  styles: Array<[number, number, number]>;
  name: string;
  handle: string;
  badge: string;
  avatar: string | null;
  media: string | null;
  poll?: { c: string[]; m: number };
  theme: string;
  phone: string;
  web: string;
  view: string;
}

export async function encodeShare(p: SharedPreview): Promise<string> {
  const wire: Wire = {
    v: 1,
    text: p.text,
    styles: p.styles.map((r) => [r.start, r.end, (r.bold ? 1 : 0) | (r.italic ? 2 : 0)]),
    name: p.identity.name,
    handle: p.identity.handle,
    badge: p.identity.badge,
    avatar: p.identity.avatar,
    media: p.media,
    ...(p.poll ? { poll: { c: p.poll.choices, m: p.poll.minutes } } : {}),
    theme: p.theme,
    phone: p.phone,
    web: p.web,
    view: p.view,
  };
  const stream = new Blob([JSON.stringify(wire)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return SHARE_PREFIX + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** Reads a `#s=…` fragment. Null for anything that isn't a well-formed v1 link Share could have made. */
export async function decodeShare(hash: string): Promise<SharedPreview | null> {
  if (!hash.startsWith(SHARE_PREFIX) || hash.length > MAX_FRAGMENT) return null;
  const bytes = fromBase64Url(hash.slice(SHARE_PREFIX.length));
  if (!bytes) return null;
  const json = await inflateCapped(bytes, MAX_JSON_BYTES);
  if (json === null) return null;
  try {
    return parseWire(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Validates every field; a bad optional field is dropped, a bad core field rejects the link. */
export function parseWire(raw: unknown): SharedPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<Record<keyof Wire, unknown>>;
  if (w.v !== 1 || typeof w.text !== "string" || w.text.length > SHARE_MAX_TEXT) return null;
  const text = w.text;
  const styles: StyleRun[] = [];
  if (Array.isArray(w.styles) && w.styles.length <= MAX_STYLE_RUNS) {
    for (const r of w.styles) {
      if (!Array.isArray(r) || r.length !== 3) continue;
      const [start, end, flags] = r;
      if (![start, end, flags].every(Number.isInteger) || start < 0 || end <= start || end > text.length || flags < 1 || flags > 3) continue;
      styles.push({ start, end, bold: (flags & 1) !== 0, italic: (flags & 2) !== 0 });
    }
  }
  const name = typeof w.name === "string" ? w.name.slice(0, 50) : "";
  const handle = typeof w.handle === "string" && /^[A-Za-z0-9_]{0,15}$/.test(w.handle) ? w.handle : "";
  const badge = BADGES.find((b) => b === w.badge) ?? "none";
  const theme = THEMES.find((t) => t === w.theme) ?? "light";
  const phone = typeof w.phone === "string" && PHONE_IDS.has(w.phone) ? w.phone : DEFAULT_PHONE_ID;
  const web = typeof w.web === "string" && WEB_IDS.has(w.web) ? w.web : "web";
  const view = w.view === "web" ? "web" : "app";
  const media = sharedImage(w.media);
  return {
    text,
    styles,
    identity: { name, handle, badge, avatar: sharedImage(w.avatar) },
    media,
    // X takes a photo or a poll, never both: a link carrying both keeps the photo.
    poll: media ? null : sharedPoll(w.poll),
    theme,
    phone,
    web,
    view,
  };
}

/** A shared poll, or null when it isn't one the composer could have made (a bad poll is dropped, not the link). */
export function sharedPoll(v: unknown): Poll | null {
  if (!v || typeof v !== "object") return null;
  const { c, m } = v as { c?: unknown; m?: unknown };
  if (!Array.isArray(c) || c.length < POLL_MIN_CHOICES || c.length > POLL_MAX_CHOICES) return null;
  if (!c.every((x) => typeof x === "string" && x.length <= POLL_CHOICE_MAX)) return null;
  if (!Number.isInteger(m) || (m as number) < POLL_MIN_MINUTES || (m as number) > POLL_MAX_MINUTES) return null;
  return { choices: c as string[], minutes: m as number, images: c.map(() => null) };
}

/**
 * Only a JPEG data URL, within the byte and pixel limits Share itself produces. No remote URL can
 * get through, so opening a link never makes the browser fetch from a host the sender chose, and a
 * tiny file can't claim a huge bitmap.
 */
export function sharedImage(v: unknown): string | null {
  const prefix = "data:image/jpeg;base64,";
  if (typeof v !== "string" || !v.startsWith(prefix)) return null;
  const b64 = v.slice(prefix.length);
  if (b64.length > (MAX_IMAGE_BYTES * 4) / 3 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }
  const size = jpegSize(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  if (!size || size.width > MAX_IMAGE_EDGE || size.height > MAX_IMAGE_EDGE) return null;
  return v;
}

/** A JPEG's pixel size from its start-of-frame marker, or null if it isn't a readable JPEG. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

/** A page address as analytics may record it: without the fragment, which holds a share link's post. */
export function withoutFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

async function inflateCapped(bytes: Uint8Array, cap: number): Promise<string | null> {
  try {
    const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > cap) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(out);
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
