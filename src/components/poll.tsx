"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { Device } from "@/lib/devices";
import { filledChoices, isImagePoll, timeLeft, type Poll } from "@/lib/poll";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";
import { NextArrowIcon } from "./icons";

/**
 * A poll as a reader sees it while it runs: the voter view. The author's own view (result bars, and
 * for an image poll small pictures in rows) is not drawn; the preview shows what everyone else sees.
 *
 * Web text poll, x.com DOM (2026-10-08, a live poll from another account, 600px timeline): each
 * choice a 32px pill on a 36px pitch, 1px #1D9BF0 border, fully rounded, its label 15/20 bold
 * #1D9BF0 centred; "0 votes · 23 hours left" 15/20 in the secondary colour 12px under the last one.
 * Four choices make 518×172, three 518×136, two 518×100 (@postcheck_test tests 57, 90, 91b).
 * Web image poll (test 57c read from another account, and a stranger's live poll in both themes):
 * a sideways carousel 12px below the card's top, each choice a 240×240 picture box (1px border,
 * radius 8) with a 240×32 pill 8px under it, 252px apart; the pill and its label are neutral, not
 * blue; a 36px round "Next slide" button 12px from the right at y 134; footer 12px under; 518×324.
 *
 * iOS timeline (iPhone 15 Pro, tests 90–92 viewed from another account): pills as wide as the quote
 * embed (screen − 71, from the text column), 30pt high on a 34pt pitch; label and footer text
 * fit 13.5px Chirp (their widths against the body line's). Image poll (test 57b): a sideways row of
 * 213pt squares, 222pt apart, each with its choice in a 28pt pill 7pt under it; footer "23h left".
 * The app's picture radius and pill colours are assumed to match the web's.
 * Android has no capture: it takes the web layout in its own column (assumed). The iOS post screen
 * draws the poll across its text column (assumed). A click on a choice does nothing: on X it votes,
 * so it must not fold or expand the post the way a click elsewhere on the cell does.
 */
const stop = (e: MouseEvent) => e.stopPropagation();

/** Image-poll colours on x.com (2026-10-08): the picture box's fill (seen while it loads, or empty), the pill's border, the label. */
const IMAGE_POLL = {
  light: { fill: "#CFD9DE", pill: "#CFD9DE", label: "#0F1419" },
  dark: { fill: "#333639", pill: "#536471", label: "#EFF3F4" },
} as const;

export function PollCard({ poll, device, theme }: { poll: Poll; device: Device; theme: XTheme }) {
  const choices = filledChoices(poll);
  const images = isImagePoll(poll);
  const ios = device.kind === "phone" && device.platform === "ios";
  const width = ios ? (device.view === "post" ? device.textWidth : device.width - 71) : device.textWidth;
  const text: CSSProperties = { fontFamily: fontStack(device.font), letterSpacing: `var(--ls-${device.pane})` };
  const look = IMAGE_POLL[theme.id];
  const pill = (label: string, height: number, size: number, line: number, extra?: CSSProperties) => (
    <div
      data-poll-choice=""
      style={{ ...text, height, boxSizing: "border-box", border: `1px solid ${images ? look.pill : theme.link}`, borderRadius: 9999, padding: "0 15px", display: "flex", alignItems: "center", justifyContent: "center", color: images ? look.label : theme.link, fontSize: size, lineHeight: `${line}px`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...extra }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>
  );
  // A choice with no picture yet shows the box's own fill (X won't post until every choice has one).
  const picture = (src: string | null, size: number) => (
    <div data-poll-picture="" style={{ width: size, height: size, boxSizing: "border-box", border: `1px solid ${theme.cardBorder}`, borderRadius: 8, backgroundColor: look.fill, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );
  // Swiped sideways like X's ScrollSnap list, with no scrollbar; PNG export keeps the scroll position.
  const carousel = (item: number, gap: number, pillTop: number, pillHeight: number, size: number, line: number) => (
    <div data-poll-carousel="" style={{ display: "flex", gap, overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
      {choices.map((c, i) => (
        <div key={i} data-poll-row="" style={{ width: item, flex: "none", scrollSnapAlign: "start" }}>
          {picture(c.image, item)}
          {pill(c.label, pillHeight, size, line, { marginTop: pillTop })}
        </div>
      ))}
    </div>
  );

  if (ios) {
    const footer = (
      <div data-poll-footer="" style={{ ...text, marginTop: 8, fontSize: 13.5, lineHeight: "18px", color: theme.secondary }}>
        0 votes · {timeLeft(poll.minutes, images ? "app-short" : "app")}
      </div>
    );
    if (images) {
      return (
        <div data-poll="" onClick={stop} style={{ width }}>
          {carousel(213, 9, 7, 28, 13.5, 18)}
          {footer}
        </div>
      );
    }
    return (
      <div data-poll="" onClick={stop} style={{ width, display: "flex", flexDirection: "column", gap: 4 }}>
        {choices.map((c, i) => <div key={i} data-poll-row="">{pill(c.label, 30, 13.5, 18)}</div>)}
        <div style={{ marginTop: -4 }}>{footer}</div>
      </div>
    );
  }

  const footer = (
    <div data-poll-footer="" style={{ ...text, marginTop: 12, fontSize: 15, lineHeight: "20px", color: theme.secondary }}>
      0 votes · {timeLeft(poll.minutes, "web")}
    </div>
  );
  if (images) {
    return (
      <div data-poll="" onClick={stop} style={{ width, position: "relative", paddingTop: 12 }}>
        <WithNextButton count={choices.length}>{carousel(240, 12, 8, 32, 15, 20)}</WithNextButton>
        {footer}
      </div>
    );
  }
  return (
    <div data-poll="" onClick={stop} style={{ width }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {choices.map((c, i) => <div key={i} data-poll-row="">{pill(c.label, 32, 15, 20)}</div>)}
      </div>
      {footer}
    </div>
  );
}

/**
 * x.com's "Next slide" button over a carousel, shown while choices run past the column's right edge
 * (two 240px choices fit in 518, so they get none). It goes once the carousel is swiped to its end.
 * It measures the carousel when it mounts, when the choice count changes and on every scroll, so a
 * carousel drawn afresh always starts with the button X shows at its first slide.
 */
function WithNextButton({ count, children }: { count: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[data-poll-carousel]");
    if (!el) return;
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [count]);
  return (
    <div ref={box}>
      {children}
      {more && (
        <div data-poll-next="" aria-hidden style={{ position: "absolute", right: 12, top: 134, width: 36, height: 36, borderRadius: 9999, backgroundColor: "rgba(15,20,25,0.75)", backdropFilter: "blur(4px)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NextArrowIcon size={20} />
        </div>
      )}
    </div>
  );
}
