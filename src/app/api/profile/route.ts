import { NextResponse } from "next/server";
import { NO_STORE, postOnly, readLookupField } from "@/lib/server/fetch-guard";
import { AVATAR_CAP, avatarSrc, badgeFor, fetchTwimg, lookupProfile, twimgUrl } from "@/lib/server/fxtwitter";

/**
 * Looks up an X account's name, avatar and verified badge by username through
 * FxTwitter's public API (api.fxtwitter.com), with vxtwitter as the fallback
 * (see lookupProfile). X's own user lookup is paid
 * ($0.01 a read since February 2026) and its syndication profile page no longer
 * carries user data. The avatar is inlined so the PNG export can draw it.
 * The handle arrives in a POST body and nothing is cached or logged: see readLookupField.
 */
export const runtime = "nodejs";

/** POST only: a stray GET gets an uncacheable 405 (see postOnly). */
export const GET = postOnly;

export interface Profile {
  name: string;
  handle: string;
  avatar: string | null;
  /** null when the answer came from vxtwitter, which can't tell: the client keeps the badge it has. */
  badge: "none" | "blue" | "gold" | "gray" | null;
}

export async function POST(request: Request) {
  const raw = ((await readLookupField(request, "u")) ?? "").trim();
  const handle = raw.match(/^(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!handle) return NextResponse.json({ error: "Enter an X username" }, { status: 400, headers: NO_STORE });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const found = await lookupProfile(handle, controller.signal);
    if (!found.user) {
      return NextResponse.json({ error: found.missing ? `No account @${handle}` : "Lookup failed. Enter the details by hand." }, { status: found.missing ? 404 : 502, headers: NO_STORE });
    }
    const u = found.user;
    const avatarUrl = twimgUrl(avatarSrc(u));
    const avatar = avatarUrl ? await fetchTwimg(avatarUrl, controller.signal, AVATAR_CAP) : null;
    // Third-party JSON: coerced and clamped like the quote path (fxtwitter.ts toQuote).
    const profile: Profile = { name: String(u.name ?? "").slice(0, 100), handle: String(u.screen_name).slice(0, 15), avatar, badge: found.verified ? badgeFor(u.verification) : null };
    return NextResponse.json({ profile }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Lookup failed. Enter the details by hand." }, { status: 502, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing outlives the answer
  }
}
