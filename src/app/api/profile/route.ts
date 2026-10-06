import { NextResponse } from "next/server";
import { NO_STORE, fetchImageAsDataUrl, guardedFetch, readCapped, readLookupField } from "@/lib/server/fetch-guard";

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

/** The lookup takes a POST body only. A stray GET (say, an old link with the handle in its address) gets a 405 that no cache keeps. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } });
}

export interface Profile {
  name: string;
  handle: string;
  avatar: string | null;
  badge: "none" | "blue" | "gold" | "gray";
}

/** FxTwitter's verification type → X's badge color. */
function badgeFor(v: FxUser["verification"]): Profile["badge"] {
  if (!v?.verified) return "none";
  return v.type === "organization" ? "gold" : v.type === "government" ? "gray" : "blue";
}

interface FxUser {
  name?: string;
  screen_name?: string;
  avatar_url?: string;
  verification?: { verified?: boolean; type?: string };
}

export async function POST(request: Request) {
  const raw = ((await readLookupField(request, "u")) ?? "").trim();
  const handle = raw.match(/^(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!handle) return NextResponse.json({ error: "Enter an X username" }, { status: 400, headers: NO_STORE });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Through the shared guard like every other outbound fetch: each redirect hop re-checked for a
    // public address, and the JSON read capped (a profile answer is a few KB).
    const { res } = await guardedFetch(new URL(`https://api.fxtwitter.com/${handle}`), "application/json", controller.signal);
    const body = await readCapped(res, PROFILE_JSON_CAP + 1);
    const j = (body.byteLength > PROFILE_JSON_CAP ? null : (() => { try { return JSON.parse(new TextDecoder().decode(body)); } catch { return null; } })()) as { user?: FxUser } | null;
    const u = j?.user;
    if (!u?.screen_name) {
      const missing = res.ok || res.status === 404;
      return NextResponse.json({ error: missing ? `No account @${handle}` : "Lookup failed. Enter the details by hand." }, { status: missing ? 404 : 502, headers: NO_STORE });
    }
    const avatar = u.avatar_url ? await fetchImageAsDataUrl(new URL(u.avatar_url.replace("_normal", "_200x200")), controller.signal) : null;
    const profile: Profile = { name: u.name ?? "", handle: u.screen_name, avatar, badge: badgeFor(u.verification) };
    return NextResponse.json({ profile }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Lookup failed. Enter the details by hand." }, { status: 502, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
