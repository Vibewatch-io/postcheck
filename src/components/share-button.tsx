"use client";

import { useEffect, useRef, useState } from "react";
import { SHARE_LINK_BUDGET, SHARE_MAX_TEXT, encodeShare, type SharedPreview } from "@/lib/share";

/** Attached image sizes to try, largest first, until the link fits the budget. */
const MEDIA_STEPS: Array<[maxEdge: number, quality: number]> = [
  [720, 0.72],
  [560, 0.66],
  [440, 0.6],
  [340, 0.55],
];
const AVATAR_EDGE = 96;

type Status = { kind: "idle" | "working" | "copied" } | { kind: "note"; text: string; url?: string };

/**
 * Copies a link that holds the whole preview. Images are shrunk to JPEG in the browser first, so
 * nothing is uploaded anywhere; the attached image steps down in size until the link fits.
 */
export function ShareButton({ preview }: { preview: () => SharedPreview }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const boxRef = useRef<HTMLDivElement>(null);

  // A note stays until you click elsewhere; "Link copied" fades on its own.
  useEffect(() => {
    if (status.kind === "copied") {
      const t = setTimeout(() => setStatus({ kind: "idle" }), 2000);
      return () => clearTimeout(t);
    }
    if (status.kind !== "note") return;
    const close = (e: PointerEvent) => boxRef.current?.contains(e.target as Node) || setStatus({ kind: "idle" });
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [status]);

  const share = () => {
    if (status.kind === "working") return;
    setStatus({ kind: "working" });
    const made = makeLink(preview());
    // Safari only lets a page write the clipboard during the click, so the item is handed over
    // now and filled in when the link is ready.
    const write =
      typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "text/plain": made.then((m) => (m.url ? new Blob([m.url], { type: "text/plain" }) : Promise.reject(new Error("no link")))) })])
        : made.then((m) => (m.url ? navigator.clipboard.writeText(m.url) : undefined));
    void Promise.allSettled([made, write]).then(([m, w]) => {
      if (m.status === "rejected") return setStatus({ kind: "note", text: "This browser can't make share links. Try a current Chrome, Safari or Firefox." });
      const { url, left } = m.value;
      if (!url) return setStatus({ kind: "note", text: "This post is too long to fit in a link." });
      // Whatever the link couldn't carry is named, whichever way the link reaches the user.
      const without = left.length ? ` It leaves out the ${left.join(" and ")}.` : "";
      if (w.status === "rejected") return setStatus({ kind: "note", text: `Copy this link to share the preview.${without}`, url });
      if (without) return setStatus({ kind: "note", text: `Link copied.${without}` });
      setStatus({ kind: "copied" });
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={share}
        aria-busy={status.kind === "working"}
        title="Copy a link to this preview. The post travels inside the link; nothing is uploaded."
        // The label never changes, so nothing beside the button moves; progress and "Link copied"
        // show below it instead.
        className={`h-8 flex-none whitespace-nowrap rounded-lg border border-brand-warm-border bg-white px-3 text-[13px] font-medium text-brand-warm-dark hover:bg-brand-warm-surface ${status.kind === "working" ? "cursor-progress opacity-60" : ""}`}
      >
        Share
      </button>
      {status.kind === "copied" && (
        <div role="status" className="absolute right-0 top-10 z-20 whitespace-nowrap rounded-lg border border-brand-warm-border bg-white px-3 py-2 text-[13px] text-brand-warm-dark shadow-md">
          Link copied
        </div>
      )}
      {status.kind === "note" && (
        <div role="status" className="absolute right-0 top-10 z-20 w-80 rounded-lg border border-brand-warm-border bg-white p-3 text-[13px] leading-snug text-brand-warm-dark shadow-md">
          <p>{status.text}</p>
          {status.url && (
            <input
              readOnly
              value={status.url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              className="mt-2 w-full rounded-md border border-brand-warm-border px-2 py-1 text-[12px] text-brand-warm-gray"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * `left` names what the link doesn't carry: an image that didn't fit the budget, or one the
 * browser couldn't redraw. A post longer than a shared page will read gets no link at all.
 */
async function makeLink(p: SharedPreview): Promise<{ url: string | null; left: string[] }> {
  if (p.text.length > SHARE_MAX_TEXT) return { url: null, left: [] };
  const avatar = p.identity.avatar ? await shrink(p.identity.avatar, AVATAR_EDGE, 0.8, true).catch(() => null) : null;
  const photoLost = Boolean(p.identity.avatar) && !avatar;
  const base = { ...p, identity: { ...p.identity, avatar } };
  const at = (fragment: string) => `${location.origin}${location.pathname}${fragment}`;
  if (p.media) {
    for (const [edge, quality] of MEDIA_STEPS) {
      const media = await shrink(p.media, edge, quality).catch(() => null);
      if (!media) break;
      const url = at(await encodeShare({ ...base, media }));
      if (url.length <= SHARE_LINK_BUDGET) return { url, left: photoLost ? ["profile photo"] : [] };
    }
  }
  // Last resorts before refusing: no attached image, then no photo either.
  const image = p.media ? ["image"] : [];
  const attempts: Array<[SharedPreview["identity"], string[]]> = [[base.identity, [...image, ...(photoLost ? ["profile photo"] : [])]]];
  if (avatar) attempts.push([{ ...base.identity, avatar: null }, [...image, "profile photo"]]);
  for (const [identity, left] of attempts) {
    const url = at(await encodeShare({ ...base, identity, media: null }));
    if (url.length <= SHARE_LINK_BUDGET) return { url, left };
  }
  return { url: null, left: [] };
}

/** Redraws an image as a JPEG no larger than `edge` on its long side (or a centred square). */
async function shrink(src: string, edge: number, quality: number, square = false): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  let [sx, sy, sw, sh] = [0, 0, img.naturalWidth, img.naturalHeight];
  let w: number, h: number;
  if (square) {
    const side = Math.min(sw, sh);
    [sx, sy, sw, sh] = [(sw - side) / 2, (sh - side) / 2, side, side];
    w = h = Math.min(edge, side);
  } else {
    const k = Math.min(1, edge / Math.max(sw, sh));
    [w, h] = [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))];
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // JPEG has no transparency: flatten onto white.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
