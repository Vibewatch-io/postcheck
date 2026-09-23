"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Device } from "@/lib/devices";
import type { XTheme } from "@/lib/theme";
import { X_FONT_STACK } from "@/lib/theme";
import { BellIcon, HomeIcon, MailIcon, SearchIcon, XLogo } from "./icons";

interface Props {
  device: Device;
  theme: XTheme;
  children: ReactNode;
  /** Tallest the frame should be. Empty screen below the post is cut, but the post itself never is. */
  maxHeight?: number;
}

/** The viewer's clock as a phone status bar shows it ("h:mm", no AM/PM), ticking on the minute. */
function useClock(): string | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  if (!now) return null;
  return `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** A phone bezel with the app's status bar, header, tabs and bottom bar around the post. */
export function PhoneFrame({ device, theme, children, maxHeight }: Props) {
  const island = device.island ?? "none";
  const statusH = island === "dynamic-island" ? 54 : island === "notch" ? 47 : island === "punch-hole" ? 40 : 20;
  const radius = device.radius ?? 0;
  const bezel = 12;
  // Rendered on the client only, so the server's clock never shows up in the page.
  const clock = useClock() ?? "";
  const light = theme.id === "light";
  const ios = device.id.startsWith("iphone");
  const post = device.view === "post";
  // The post is never cut. When the window can't hold the whole screen, the app's furniture goes
  // instead, in this order, so what's left is still the real post in the real column.
  const postRef = useRef<HTMLDivElement>(null);
  const [postHeight, setPostHeight] = useState(0);
  useEffect(() => {
    const postArea = postRef.current;
    const cell = postArea?.firstElementChild;
    if (!postArea || !cell) return;
    // The post area is flex-1, so measure the post itself, not the space it was given.
    const measure = () => setPostHeight(Math.ceil(cell.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cell);
    return () => ro.disconnect();
  }, []);

  const indicatorH = ios && island !== "none" ? 34 : 0;
  const bottomBarH = 51;
  const tabsH = post ? 52 : 49;
  const headerH = post ? 44 : 54;
  const full = device.height ?? 0;
  const room = maxHeight ? maxHeight - bezel * 2 : full;
  // Drop furniture only while the whole screen doesn't fit, least important first.
  const dropped = ((): { indicator: boolean; bottomBar: boolean; tabs: boolean; header: boolean; status: boolean } => {
    const drop = { indicator: false, bottomBar: false, tabs: false, header: false, status: false };
    const chromeAll = statusH + headerH + tabsH + bottomBarH + indicatorH;
    let over = postHeight > 0 ? chromeAll + postHeight - room : 0;
    for (const [key, h] of [
      ["indicator", indicatorH],
      ["bottomBar", bottomBarH],
      ["tabs", tabsH],
      ["header", headerH],
      ["status", statusH],
    ] as const) {
      if (over <= 0) break;
      drop[key] = true;
      over -= h;
    }
    return drop;
  })();
  const { indicator: dropIndicator, bottomBar: dropBottomBar, tabs: dropTabs, header: dropHeader, status: dropStatus } = dropped;
  const chromeH =
    (dropStatus ? 0 : statusH) + (dropHeader ? 0 : headerH) + (dropTabs ? 0 : tabsH) + (dropBottomBar ? 0 : bottomBarH) + (dropIndicator ? 0 : indicatorH);
  const screenHeight = postHeight === 0 ? full : Math.min(full, Math.max(chromeH + postHeight, Math.min(room, full)));

  return (
    <div style={{ padding: bezel, backgroundColor: "#111113", borderRadius: radius ? radius + bezel : 28, width: device.width + bezel * 2, boxSizing: "border-box" }}>
      {/* The screen is the device's real point size; a long post is clipped the way it is on the phone. */}
      <div style={{ width: device.width, height: screenHeight, borderRadius: radius, overflow: "hidden", backgroundColor: theme.bg, position: "relative", fontFamily: X_FONT_STACK, color: theme.text, display: "flex", flexDirection: "column" }}>
        {/* status bar */}
        {!dropStatus && (
        <div style={{ height: statusH, position: "relative", display: "flex", alignItems: island === "none" ? "center" : "flex-end", justifyContent: "space-between", padding: island === "none" ? "0 8px" : "0 30px 8px", fontSize: 16, fontWeight: 600, fontFamily: ios ? '-apple-system, "SF Pro Text", system-ui, sans-serif' : 'Roboto, system-ui, sans-serif' }}>
          <span suppressHydrationWarning>{clock}</span>
          {island === "dynamic-island" && <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 125, height: 37, borderRadius: 20, backgroundColor: "#000" }} />}
          {island === "notch" && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 160, height: 32, borderRadius: "0 0 20px 20px", backgroundColor: "#000" }} />}
          {island === "punch-hole" && <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", backgroundColor: "#000" }} />}
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
              <rect x="0" y="8" width="3" height="4" rx="0.8" /><rect x="5" y="5.5" width="3" height="6.5" rx="0.8" /><rect x="10" y="3" width="3" height="9" rx="0.8" /><rect x="15" y="0" width="3" height="12" rx="0.8" />
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
              <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.3-1.4A10.7 10.7 0 0 0 8 .3 10.7 10.7 0 0 0 .7 3.4L2 4.8A8.7 8.7 0 0 1 8 2.4zm0 3.5c1.4 0 2.6.5 3.6 1.4l1.3-1.4A7.3 7.3 0 0 0 8 3.9a7.3 7.3 0 0 0-4.9 2l1.3 1.4A5.4 5.4 0 0 1 8 5.9zm0 3.5c.6 0 1.1.2 1.5.6L8 11.7 6.5 10c.4-.4.9-.6 1.5-.6z" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
              <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity="0.4" /><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" /><path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.4" />
            </svg>
          </span>
        </div>
        )}
        {/* app header */}
        {post ? (
          !dropHeader && (
          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", fontSize: 17, fontWeight: 700 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Post</span>
            <span style={{ width: 24, textAlign: "right", letterSpacing: 1 }}>···</span>
          </div>
          )
        ) : (
          <>
            {!dropHeader && (
            <div style={{ height: 53, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#CFD9DE" }} />
              <XLogo size={24} />
              <div style={{ width: 32 }} />
            </div>
            )}
            {!dropTabs && (
            <div style={{ display: "flex", borderBottom: `1px solid ${theme.border}`, fontSize: 15, fontWeight: 700 }}>
              {["For you", "Following"].map((t, i) => (
                <div key={t} style={{ flex: 1, textAlign: "center", padding: "16px 0 12px", position: "relative", color: i === 0 ? theme.text : theme.secondary }}>
                  {t}
                  {i === 0 && <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 0, width: 56, height: 4, borderRadius: 2, backgroundColor: "#1D9BF0" }} />}
                </div>
              ))}
            </div>
            )}
          </>
        )}
        <div ref={postRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
        {post && !dropTabs ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderTop: `1px solid ${theme.border}` }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#CFD9DE", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 36, borderRadius: 18, backgroundColor: light ? "#EFF3F4" : "#202327", color: theme.secondary, fontSize: 15, display: "flex", alignItems: "center", padding: "0 14px" }}>Post your reply</div>
          </div>
        ) : null}
        {/* bottom bar */}
        {!dropBottomBar && (
        <div style={{ borderTop: `1px solid ${theme.border}`, height: 50, display: "flex", alignItems: "center", justifyContent: "space-around", color: theme.text, padding: "0 8px" }}>
          <HomeIcon size={26} />
          <SearchIcon size={26} style={{ color: theme.secondary }} />
          <BellIcon size={26} style={{ color: theme.secondary }} />
          <MailIcon size={26} style={{ color: theme.secondary }} />
        </div>
        )}
        {!dropIndicator && ios && island !== "none" && (
          <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: light ? "#0F1419" : "#E6E9EA" }} />
          </div>
        )}
      </div>
    </div>
  );
}
