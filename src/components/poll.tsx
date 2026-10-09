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
 * fit 13.5px Chirp (their widths against the body line's). Image poll (test 57c from another
 * account, 2026-10-09, 1pt per pixel): a sideways row of 213pt squares (radius 7) 8pt below the
 * poll's top, 221pt apart (57c reads 220.4, 57b 222), each with its choice in a 27pt pill 7pt under
 * it, outlined and labelled in blue like a text poll's; footer "6d left" 7pt under the pills, and the
 * action row 12.5pt further down than under media (the cell's height).
 * Android (X 12.31 on a Pixel 3 at 360 and 411.4 dp) was captured only in the author's results view.
 * Its geometry is drawn for the voter view too, as the web's two views share one box: the poll sits
 * 6dp in from each side of the text column, its top 11.7dp under the text's last baseline; a text
 * choice row on a 40dp pitch with the label (the body's size) centred in it, 36dp assumed for the
 * pill as the web's and the iPhone's leave 4 between rows; the footer ("0 vote • 6 days 7 hours
 * left", 13dp, 13.7 at 411.4) has its baseline 22.3dp under the last row. The pill's look and an
 * image poll's voter view (drawn as the web's carousel) are assumed. The iOS post screen draws the
 * poll across its text column (assumed). A click on a choice does nothing: on X it votes, so it must
 * not fold or expand the post the way a click elsewhere on the cell does.
 */
const stop = (e: MouseEvent) => e.stopPropagation();

/** Image-poll colours on x.com (2026-10-08): the picture box's fill (seen while it loads, or empty), the pill's border, the label. */
const IMAGE_POLL = {
  light: { fill: "#CFD9DE", pill: "#CFD9DE", label: "#0F1419" },
  dark: { fill: "#333639", pill: "#536471", label: "#EFF3F4" },
} as const;

/**
 * Android's poll box, from the author's results view (tests 57–97 on a Pixel 3, 2026-10-09): `inset` from
 * each side of the text column; `top` moves the poll from the cell's 12dp gap to 11.7dp under the text's
 * last baseline; `pitch` per text choice, 40dp at 360 and 106px (40.38dp) at 411.4, where the body is
 * 16/21.33; the pill is assumed 4 short of it, as on the web and the iPhone; `footerTop` puts the
 * footer's baseline 22.3dp under the last row.
 */
const ANDROID = { inset: 6, top: -5.33, pitch: 40, widePitch: 40.38, footerTop: 10 } as const;

export function PollCard({ poll, device, theme }: { poll: Poll; device: Device; theme: XTheme }) {
  const choices = filledChoices(poll);
  const images = isImagePoll(poll);
  const ios = device.kind === "phone" && device.platform === "ios";
  const android = device.kind === "phone" && device.platform === "android";
  const width = ios ? (device.view === "post" ? device.textWidth : device.width - 71) : android ? device.textWidth - 2 * ANDROID.inset : device.textWidth;
  const text: CSSProperties = { fontFamily: fontStack(device.font), letterSpacing: `var(--ls-${device.pane})` };
  const look = IMAGE_POLL[theme.id];
  // The iPhone outlines an image poll's choices in blue like a text poll's (57c); x.com's are neutral.
  const neutral = images && !ios;
  const pill = (label: string, height: number, size: number, line: number, extra?: CSSProperties) => (
    <div
      data-poll-choice=""
      style={{ ...text, height, boxSizing: "border-box", border: `1px solid ${neutral ? look.pill : theme.link}`, borderRadius: 9999, padding: "0 15px", display: "flex", alignItems: "center", justifyContent: "center", color: neutral ? look.label : theme.link, fontSize: size, lineHeight: `${line}px`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...extra }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>
  );
  // A choice with no picture yet shows the box's own fill (X won't post until every choice has one).
  const picture = (src: string | null, size: number, radius: number) => (
    <div data-poll-picture="" style={{ width: size, height: size, boxSizing: "border-box", border: `1px solid ${theme.cardBorder}`, borderRadius: radius, backgroundColor: look.fill, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );
  // Swiped sideways like X's ScrollSnap list, with no scrollbar; PNG export keeps the scroll position.
  const carousel = (item: number, gap: number, pillTop: number, pillHeight: number, size: number, line: number, radius = 8) => (
    <div data-poll-carousel="" style={{ display: "flex", gap, overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
      {choices.map((c, i) => (
        <div key={i} data-poll-row="" style={{ width: item, flex: "none", scrollSnapAlign: "start" }}>
          {picture(c.image, item, radius)}
          {pill(c.label, pillHeight, size, line, { marginTop: pillTop })}
        </div>
      ))}
    </div>
  );

  if (ios) {
    const footer = (
      <div data-poll-footer="" style={{ ...text, marginTop: images ? 7 : 8, fontSize: 13.5, lineHeight: "18px", color: theme.secondary }}>
        0 votes · {timeLeft(poll.minutes, images ? "app-short" : "app")}
      </div>
    );
    if (images) {
      return (
        // 57c's cell (separator to separator, 388) runs 12.5 taller than the action row's rule under media gives.
        <div data-poll="" onClick={stop} style={{ width, paddingTop: 8, paddingBottom: 12.5 }}>
          {carousel(213, 8, 7, 27, 13.5, 18, 7)}
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

  if (android) {
    const footer = (
      <div data-poll-footer="" style={{ ...text, marginTop: ANDROID.footerTop, fontSize: device.fontSize === 16 ? 13.7 : 13, lineHeight: "16px", color: theme.secondary }}>
        0 vote • {timeLeft(poll.minutes, "app")}
      </div>
    );
    const box: CSSProperties = { width, marginLeft: ANDROID.inset, marginTop: ANDROID.top };
    const pitch = device.fontSize === 16 ? ANDROID.widePitch : ANDROID.pitch;
    if (images) {
      return (
        <div data-poll="" onClick={stop} style={{ ...box, position: "relative", paddingTop: 12 }}>
          <WithNextButton count={choices.length}>{carousel(240, 12, 8, 32, 15, 20)}</WithNextButton>
          {footer}
        </div>
      );
    }
    return (
      <div data-poll="" onClick={stop} style={box}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {choices.map((c, i) => <div key={i} data-poll-row="">{pill(c.label, pitch - 4, device.fontSize, 20)}</div>)}
        </div>
        {footer}
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
