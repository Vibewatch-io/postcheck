"use client";

import type { CSSProperties } from "react";
import type { Device } from "@/lib/devices";
import { filledChoices, isImagePoll, timeLeft, type Poll } from "@/lib/poll";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";

/**
 * A poll as a reader sees it while it runs: the voter view, one outlined button per choice. The
 * author's own view (result bars) is not drawn; the preview shows what everyone else sees.
 *
 * Web, x.com DOM (2026-10-08, a live poll from another account, 600px timeline): each choice a
 * 32px pill on a 36px pitch, 1px #1D9BF0 border, fully rounded, its label 15/20 bold #1D9BF0
 * centred; "0 votes · 23 hours left" 15/20 in the secondary colour 12px under the last one. Four
 * choices make 518×172, three 518×136, two 518×100 (@postcheck_test tests 57, 90, 91b).
 * Image poll (test 57b): a 48×48 picture with radius 4 beside each choice on a 60px pitch, 518×268;
 * the pill beside the picture (x 56, 32 high, centred on the row) is assumed: the voter view of an
 * image poll has no capture.
 *
 * iOS timeline (iPhone 15 Pro, test 92 viewed from another account): pills as wide as the quote
 * embed (screen − 71, from the text column), 30pt high on a 34pt pitch; label and footer text
 * fit 13.5px Chirp (their widths against the body line's). Image poll (test 57b): a sideways row of
 * 213pt squares, 222pt apart, each with its choice in a 28pt pill 7pt under it; footer "23h left".
 * Android has no capture: it takes the web layout in its own column (assumed).
 */
export function PollCard({ poll, device, theme }: { poll: Poll; device: Device; theme: XTheme }) {
  const choices = filledChoices(poll);
  const images = isImagePoll(poll);
  const ios = device.kind === "phone" && device.platform === "ios";
  const width = ios ? (device.view === "post" ? device.textWidth : device.width - 71) : device.textWidth;
  const text: CSSProperties = { fontFamily: fontStack(device.font), letterSpacing: `var(--ls-${device.pane})` };
  const pill = (label: string, height: number, size: number, line: number, extra?: CSSProperties) => (
    <div
      data-poll-choice=""
      style={{ ...text, height, boxSizing: "border-box", border: `1px solid ${theme.link}`, borderRadius: 9999, padding: "0 15px", display: "flex", alignItems: "center", justifyContent: "center", color: theme.link, fontSize: size, lineHeight: `${line}px`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...extra }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>
  );
  const thumb = (src: string | null, size: number, radius: number) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block", flexShrink: 0 }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: radius, backgroundColor: theme.cardBorder, flexShrink: 0 }} />
    );

  if (ios) {
    const footer = (
      <div data-poll-footer="" style={{ ...text, marginTop: 8, fontSize: 13.5, lineHeight: "18px", color: theme.secondary }}>
        0 votes · {timeLeft(poll.minutes, images ? "app-short" : "app")}
      </div>
    );
    if (images) {
      return (
        <div data-poll="" style={{ width }}>
          <div style={{ display: "flex", gap: 9, overflow: "hidden" }}>
            {choices.map((c, i) => (
              <div key={i} data-poll-row="" style={{ width: 213, flexShrink: 0 }}>
                {thumb(c.image, 213, 12)}
                {pill(c.label, 28, 13.5, 18, { marginTop: 7 })}
              </div>
            ))}
          </div>
          {footer}
        </div>
      );
    }
    return (
      <div data-poll="" style={{ width, display: "flex", flexDirection: "column", gap: 4 }}>
        {choices.map((c, i) => <div key={i} data-poll-row="">{pill(c.label, 30, 13.5, 18)}</div>)}
        <div style={{ marginTop: -4 }}>{footer}</div>
      </div>
    );
  }

  return (
    <div data-poll="" style={{ width }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {choices.map((c, i) =>
          images ? (
            <div key={i} data-poll-row="" style={{ display: "flex", alignItems: "center", gap: 8, height: 56 }}>
              {thumb(c.image, 48, 4)}
              <div style={{ flex: 1, minWidth: 0 }}>{pill(c.label, 32, 15, 20)}</div>
            </div>
          ) : (
            <div key={i} data-poll-row="">{pill(c.label, 32, 15, 20)}</div>
          ),
        )}
      </div>
      <div data-poll-footer="" style={{ ...text, marginTop: 12, fontSize: 15, lineHeight: "20px", color: theme.secondary }}>
        0 votes · {timeLeft(poll.minutes, "web")}
      </div>
    </div>
  );
}
