import { NextResponse } from "next/server";
import { cacheHeaders, fetchImageAsDataUrl } from "@/lib/server/fetch-guard";
import { AVATAR_CAP, FX_API, avatarSrc, badgeFor, twimgUrl, type FxUser } from "@/lib/server/fxtwitter";

/**
 * Looks up an X account's name, avatar and verified badge by username through
 * FxTwitter's public API (api.fxtwitter.com). X's own user lookup is paid
 * ($0.01 a read since February 2026) and its syndication profile page no longer
 * carries user data. The avatar is inlined so the PNG export can draw it.
 */
export const runtime = "nodejs";

export interface Profile {
  name: string;
  handle: string;
  avatar: string | null;
  badge: "none" | "blue" | "gold" | "gray";
}

export async function GET(request: Request) {
  const raw = (new URL(request.url).searchParams.get("u") || "").trim();
  const handle = raw.match(/^(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!handle) return NextResponse.json({ error: "Enter an X username" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // ssrf-exempt: constant-host (FX_API; only the validated handle is appended)
    const res = await fetch(`${FX_API}/${handle}`, { signal: controller.signal, redirect: "error", headers: { accept: "application/json" } });
    const j = (await res.json().catch(() => null)) as { user?: FxUser } | null;
    const u = j?.user;
    if (!u?.screen_name) {
      const missing = res.ok || res.status === 404;
      return NextResponse.json({ error: missing ? `No account @${handle}` : "Lookup failed. Enter the details by hand." }, { status: missing ? 404 : 502 });
    }
    const avatarUrl = twimgUrl(avatarSrc(u));
    const avatar = avatarUrl ? await fetchImageAsDataUrl(avatarUrl, controller.signal, AVATAR_CAP) : null;
    const profile: Profile = { name: u.name ?? "", handle: u.screen_name, avatar, badge: badgeFor(u.verification) };
    return NextResponse.json({ profile }, { headers: cacheHeaders(3600) });
  } catch {
    return NextResponse.json({ error: "Lookup failed. Enter the details by hand." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
