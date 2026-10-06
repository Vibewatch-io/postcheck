import type { QuoteBadge, QuoteData, QuoteResult } from "@/lib/quote";
import { UA, fetchImageAsDataUrl, readCapped } from "./fetch-guard";

/**
 * FxTwitter's public API (api.fxtwitter.com): X's own lookups are paid ($0.01 a
 * read since February 2026). The host is fixed here; nothing a visitor typed
 * becomes part of a URL except a status number of 1–20 digits.
 */
export const FX_API = "https://api.fxtwitter.com";

/** For guardedFetch: every hop must stay on FxTwitter's API host. */
export const onFxTwitter = (u: URL) => u.origin === FX_API;

/** Largest FxTwitter answer read: a status with its author and media is a few KB. */
const FX_CAP = 256 * 1024;
/** Longest quoted text kept (a long post is clamped to 5 lines in the embed anyway). */
const TEXT_CAP = 4000;
/**
 * Image budgets: a 200×200 avatar is ~10–40KB and X's "medium" photo ~100–300KB, so these
 * caps keep a whole answer under ~1.7MB of base64 however large the post's originals are.
 */
export const AVATAR_CAP = 256 * 1024;
export const PHOTO_CAP = 1024 * 1024;

export interface FxUser {
  name?: string;
  screen_name?: string;
  avatar_url?: string;
  verification?: { verified?: boolean; type?: string };
}

interface FxStatus {
  id?: string;
  text?: string;
  created_at?: string;
  author?: FxUser;
  media?: { photos?: Array<{ url?: string; width?: number; height?: number }> };
  poll?: unknown;
}

/** FxTwitter's verification type → X's badge color. */
export function badgeFor(v: FxUser["verification"]): QuoteBadge {
  if (!v?.verified) return "none";
  return v.type === "organization" ? "gold" : v.type === "government" ? "gray" : "blue";
}

/**
 * An image URL from FxTwitter's answer, only if it is X's own image CDN over https.
 * The answer is third-party data: an image anywhere else is never fetched.
 */
export function twimgUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "pbs.twimg.com" || u.hostname === "abs.twimg.com") && !u.port && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

type ImageFetcher = (src: URL, signal: AbortSignal, cap: number) => Promise<string | null>;

/** An image from X's CDN, refused if any redirect hop leaves it. */
export const fetchTwimg: ImageFetcher = (src, signal, cap) => fetchImageAsDataUrl(src, signal, cap, (u) => twimgUrl(u.href) !== null);

/** The 200×200 rendition of an account's avatar, if FxTwitter gave a URL at all. */
export function avatarSrc(user: FxUser): string | null {
  return typeof user.avatar_url === "string" ? user.avatar_url.replace("_normal", "_200x200") : null;
}

/**
 * Looks up one post by its status number. Images are inlined as data URLs (through
 * the guarded fetch) so the browser never asks X's CDN for them and the PNG export
 * can draw them.
 */
export async function lookupQuote(id: string, signal: AbortSignal, deps: { fetch?: typeof fetch; image?: ImageFetcher } = {}): Promise<QuoteResult> {
  if (!/^\d{1,20}$/.test(id)) return { status: "unavailable" };
  const get = deps.fetch ?? fetch;
  const image = deps.image ?? fetchTwimg;
  // ssrf-exempt: constant-host (FX_API; only the validated status number is appended)
  const answer = await get(`${FX_API}/status/${id}`, {
    signal,
    // The host is fixed, so a redirect would only ever lead somewhere unchecked: refuse it.
    redirect: "error",
    headers: { accept: "application/json", "user-agent": UA },
  })
    .then(async (res) => {
      const bytes = await readCapped(res, FX_CAP + 1);
      if (bytes.byteLength > FX_CAP) return null;
      return { res, json: JSON.parse(new TextDecoder().decode(bytes)) as { code?: number; tweet?: FxStatus | null } | null };
    })
    .catch(() => null);
  if (!answer) return { status: "error" };
  const { res, json } = answer;
  // FxTwitter answers 404 for a deleted or never-posted status and 401 for a protected account;
  // an answer that says outright there is no post means the same.
  const code = typeof json?.code === "number" ? json.code : res.status;
  if (code === 404 || code === 401 || code === 403 || (res.ok && json?.tweet === null)) return { status: "unavailable" };
  const t = json?.tweet;
  if (!res.ok || code !== 200 || !t || String(t.id) !== id || !t.author?.screen_name) return { status: "error" };
  // Everything below reads third-party JSON: any surprise in its shape is a failed lookup, not a crash.
  try {
    return { status: "ok", quote: await toQuote(id, t, t.author, signal, image) };
  } catch {
    return { status: "error" };
  }
}

async function toQuote(id: string, t: FxStatus, author: FxUser, signal: AbortSignal, image: ImageFetcher): Promise<QuoteData> {
  const avatarUrl = twimgUrl(avatarSrc(author));
  const first = t.media?.photos?.[0];
  const photoUrl = twimgUrl(first?.url);
  // X's "medium" rendition (≤1200px) is ~100–300KB; a photo past PHOTO_CAP is left out.
  if (photoUrl) photoUrl.searchParams.set("name", "medium");
  const [avatar, photoSrc] = await Promise.all([avatarUrl ? image(avatarUrl, signal, AVATAR_CAP) : null, photoUrl ? image(photoUrl, signal, PHOTO_CAP) : null]);
  const width = Number(first?.width);
  const height = Number(first?.height);
  return {
    id,
    name: String(author.name ?? "").slice(0, 100),
    handle: String(author.screen_name).slice(0, 15),
    avatar,
    badge: badgeFor(author.verification),
    text: String(t.text ?? "").slice(0, TEXT_CAP),
    createdAt: typeof t.created_at === "string" && !Number.isNaN(Date.parse(t.created_at)) ? new Date(t.created_at).toISOString() : "",
    photo: photoSrc && width > 0 && height > 0 ? { src: photoSrc, width, height } : null,
    poll: Boolean(t.poll),
  };
}
