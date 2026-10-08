import type { StyleRun } from "./entities";
import { DEFAULT_PHONE_ID, DEVICES } from "./devices";
import { MAX_MEDIA, type MediaItem, type MediaKind } from "./media";

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
/** A shared item's recorded shape and a video's length: generous bounds, only there to refuse nonsense. */
const MAX_MEDIA_SIDE = 20_000;
const MAX_VIDEO_MS = 4 * 60 * 60 * 1000;
const KINDS: MediaKind[] = ["photo", "gif", "video"];

const BADGES = ["none", "blue", "gold", "gray"] as const;
const THEMES = ["light", "dark"] as const;
const PHONE_IDS = new Set(DEVICES.filter((d) => d.kind === "phone").map((d) => d.id));
const WEB_IDS = new Set(DEVICES.filter((d) => d.kind !== "phone").map((d) => d.id));

export interface SharedPreview {
  text: string;
  styles: StyleRun[];
  identity: { name: string; handle: string; badge: (typeof BADGES)[number]; avatar: string | null };
  /** Up to 4 items, each a JPEG Share made (a GIF's or video's first frame). */
  media: MediaItem[];
  theme: (typeof THEMES)[number];
  /** Device ids: a phone for the Mobile view, a web layout for the Web view. */
  phone: string;
  web: string;
  view: "app" | "web";
}

/**
 * Wire format v1. Style runs travel as [start, end, flags] with bold = 1, italic = 2. Media travels
 * as `items`, [jpeg, kind, width, height, alt (0/1), video ms]; links made before several items
 * could be attached carry one photo in `media`, which still opens.
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
  items?: Array<[string, string, number, number, number, number]>;
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
    media: null,
    items: p.media.map((m) => [m.src, m.kind, m.width, m.height, m.alt ? 1 : 0, m.durationMs ?? 0]),
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
  return {
    text,
    styles,
    identity: { name, handle, badge, avatar: sharedImage(w.avatar) },
    media: sharedMedia(w.items, w.media),
    theme,
    phone,
    web,
    view,
  };
}

/** The shared items, each checked; a bad item is dropped. A v1 link's single image opens as one photo. */
function sharedMedia(items: unknown, legacy: unknown): MediaItem[] {
  if (!Array.isArray(items)) {
    const src = sharedImage(legacy);
    const size = src ? jpegSize(Uint8Array.from(atob(src.slice(src.indexOf(",") + 1)), (c) => c.charCodeAt(0))) : null;
    return src && size ? [{ src, kind: "photo", width: size.width, height: size.height, alt: false }] : [];
  }
  const out: MediaItem[] = [];
  for (const it of items.slice(0, MAX_MEDIA)) {
    if (!Array.isArray(it) || it.length !== 6) continue;
    const [raw, kind, width, height, alt, ms] = it;
    const src = sharedImage(raw);
    const k = KINDS.find((x) => x === kind);
    const side = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= MAX_MEDIA_SIDE;
    if (!src || !k || !side(width) || !side(height) || (alt !== 0 && alt !== 1) || !Number.isInteger(ms) || ms < 0 || ms > MAX_VIDEO_MS) continue;
    out.push({ src, kind: k, width, height, alt: alt === 1, ...(k === "video" && ms > 0 ? { durationMs: ms } : {}) });
  }
  return out;
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
