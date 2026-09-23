"use client";

import { useEffect, useState } from "react";

/**
 * Which body font actually loaded. Chirp comes from X's CDN and can be
 * blocked at any time; GT America is the licensed stand-in; otherwise the
 * system stack. The tier is stamped on <html data-font> so CSS can apply the
 * tracking calibrated for that font (globals.css), and the page can say so.
 */
export type FontTier = "chirp" | "gt" | "system";

/** Width of the reference line at 15px: measured on x.com (Chirp) and in the calibration run (GT America). */
const REF = "Every week, the 10 most active public voices in";
const WIDTHS: Record<Exclude<FontTier, "system">, number> = { chirp: 320.3, gt: 314.5 };

export function detectFontTier(): FontTier {
  const probe = (family: string) => {
    const s = document.createElement("span");
    s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:15px;font-family:${family}`;
    s.textContent = REF;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  if (Math.abs(probe("TwitterChirpWeb, monospace") - WIDTHS.chirp) < 1.5) return "chirp";
  if (Math.abs(probe("GTAmerica, monospace") - WIDTHS.gt) < 1.5) return "gt";
  return "system";
}

export function useFontTier(): FontTier | null {
  const [tier, setTier] = useState<FontTier | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await Promise.allSettled([document.fonts.load("15px TwitterChirpWeb"), document.fonts.load("15px GTAmerica"), document.fonts.ready]);
      } catch {
        /* fall through to measurement */
      }
      if (cancelled) return;
      const t = detectFontTier();
      document.documentElement.dataset.font = t;
      setTier(t);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);
  return tier;
}
