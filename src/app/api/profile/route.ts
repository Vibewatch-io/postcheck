import { NextResponse } from "next/server";
import { NO_STORE, postOnly, guardedFetch, readCapped, readLookupField } from "@/lib/server/fetch-guard";
import { AVATAR_CAP, FX_API, avatarSrc, badgeFor, fetchTwimg, onFxTwitter, twimgUrl, type FxUser } from "@/lib/server/fxtwitter";

/**
 * Looks up an X account's name, avatar and verified badge by username through
 * FxTwitter's public API (api.fxtwitter.com). X's own user lookup is paid
 * ($0.01 a read since February 2026) and its syndication profile page no longer
 * carries user data. The avatar is inlined so the PNG export can draw it.
 * The handle arrives in a POST body and nothing is cached or logged: see readLookupField.
 */
export const runtime = "nodejs";

/** Largest FxTwitter profile answer read (they run a few KB). */
const PROFILE_JSON_CAP = 256 * 1024;

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export interface Profile {
  name: string;
  handle: string;
  avatar: string | null;
  badge: "none" | "blue" | "gold" | "gray";
}

export async function POST(request: Request) {
  const raw = ((await readLookupField(request, "u")) ?? "").trim();
  const handle = raw.match(/^(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!handle) return NextResponse.json({ error: "Enter an X username" }, { status: 400, headers: NO_STORE });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Through the shared guard like every other outbound fetch: each redirect hop re-checked for a
    // public address and kept on FxTwitter's host, and the JSON read capped (a profile answer is a few KB).
    const { res } = await guardedFetch(new URL(`${FX_API}/${handle}`), "application/json", controller.signal, onFxTwitter);
    const body = await readCapped(res, PROFILE_JSON_CAP + 1);
    const j = (body.byteLength > PROFILE_JSON_CAP ? null : (() => { try { return JSON.parse(new TextDecoder().decode(body)); } catch { return null; } })()) as { user?: FxUser } | null;
    const u = j?.user;
    if (!u?.screen_name) {
      const missing = res.ok || res.status === 404;
      return NextResponse.json({ error: missing ? `No account @${handle}` : "Lookup failed. Enter the details by hand." }, { status: missing ? 404 : 502, headers: NO_STORE });
    }
    const avatarUrl = twimgUrl(avatarSrc(u));
    const avatar = avatarUrl ? await fetchTwimg(avatarUrl, controller.signal, AVATAR_CAP) : null;
    // Third-party JSON: coerced and clamped like the quote path (fxtwitter.ts toQuote).
    const profile: Profile = { name: String(u.name ?? "").slice(0, 100), handle: String(u.screen_name).slice(0, 15), avatar, badge: badgeFor(u.verification) };
    return NextResponse.json({ profile }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Lookup failed. Enter the details by hand." }, { status: 502, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing outlives the answer
  }
}
