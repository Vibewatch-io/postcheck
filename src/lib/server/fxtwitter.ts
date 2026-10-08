import type { QuoteBadge, QuoteData, QuoteResult } from "@/lib/quote";
import { UA, fetchImageAsDataUrl, guardedFetch, readCapped, type GuardFetch } from "./fetch-guard";

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

/**
 * vxtwitter's public API, asked only when FxTwitter has no user: on 2026-10-08 FxTwitter's user
 * endpoint answered 404 "User not found" for accounts that exist on 1 to 4 requests in 10, at random
 * and in bursts (retries a few hundred ms apart didn't escape them), while vxtwitter answered every
 * time. vxtwitter carries no verification and caches an account for up to a day.
 */
export const VX_API = "https://api.vxtwitter.com";
export const onVxTwitter = (u: URL) => u.origin === VX_API;

/** Largest profile answer read from either API (they run a few KB). */
const PROFILE_JSON_CAP = 256 * 1024;

interface ProfileAnswer {
  status: number;
  ok: boolean;
  user: FxUser | null;
}

/** One profile request through the guard: every hop public and on `allow`'s host, the answer capped. */
async function askProfile(url: URL, allow: (u: URL) => boolean, signal: AbortSignal, fetchImpl: GuardFetch | undefined, pick: (json: unknown) => FxUser | null): Promise<ProfileAnswer> {
  const { res } = await guardedFetch(url, "application/json", signal, allow, fetchImpl);
  const body = await readCapped(res, PROFILE_JSON_CAP + 1);
  let json: unknown = null;
  if (body.byteLength <= PROFILE_JSON_CAP) {
    try {
      json = JSON.parse(new TextDecoder().decode(body));
    } catch {
      json = null;
    }
  }
  return { status: res.status, ok: res.ok, user: pick(json) };
}

const fxUser = (json: unknown): FxUser | null => {
  const u = (json as { user?: FxUser } | null)?.user;
  return u?.screen_name ? u : null;
};

/** vxtwitter's flat record, in FxTwitter's shape (no verification). */
const vxUser = (json: unknown): FxUser | null => {
  const j = json as { name?: unknown; screen_name?: unknown; profile_image_url?: unknown } | null;
  return typeof j?.screen_name === "string" && j.screen_name ? { name: typeof j.name === "string" ? j.name : "", screen_name: j.screen_name, avatar_url: typeof j.profile_image_url === "string" ? j.profile_image_url : undefined } : null;
};

/**
 * An account's name, handle and avatar URL: FxTwitter first, vxtwitter when FxTwitter has no user or
 * fails. `verified` is false when the answer came from vxtwitter, which can't tell. `missing` is true
 * only when both answer 404; anything else unanswered (an error, an answer for another account) is a
 * failed lookup.
 */
export async function lookupProfile(
  handle: string,
  signal: AbortSignal,
  fetchImpl?: GuardFetch,
): Promise<{ user: FxUser; verified: boolean } | { user: null; missing: boolean }> {
  // An answer for some other account (a stale or confused cache) counts as no answer.
  const same = (u: FxUser | null) => (u && String(u.screen_name).toLowerCase() === handle.toLowerCase() ? u : null);
  const ask = (base: string, allow: (u: URL) => boolean, pick: (json: unknown) => FxUser | null) =>
    askProfile(new URL(`${base}/${handle}`), allow, signal, fetchImpl, (json) => same(pick(json))).catch((): null => null);
  const fx = await ask(FX_API, onFxTwitter, fxUser);
  if (fx?.user) return { user: fx.user, verified: true };
  const vx = await ask(VX_API, onVxTwitter, vxUser);
  if (vx?.user) return { user: vx.user, verified: false };
  return { user: null, missing: fx?.status === 404 && vx?.status === 404 };
}

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
