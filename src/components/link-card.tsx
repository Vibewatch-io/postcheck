"use client";

import type { CardData } from "@/lib/card";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";
import { LinkIcon } from "./icons";

interface Props {
  card: CardData | "loading";
  theme: XTheme;
  /** Width of the column the card sits in (drives the thumbnail size). */
  width: number;
  /** Viewport width X's breakpoints see (screen width on phones). */
  viewport: number;
  font: "web" | "app";
  /** x.com itself (timeline or post page), not a phone: only there are the 2026-10-07 card metrics measured. */
  web: boolean;
  /** The iOS timeline cell: its pill, "From" line and small card are measured on iPhone captures (2026-10-08). */
  ios: boolean;
  /** The Android app: no card fill (dark-theme captures of tests 20–31, 2026-10-08). */
  android: boolean;
}

const clamp = (lines: number): React.CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
});

/**
 * X's two link cards, as measured on x.com (Sept 2026).
 * Small ("summary"): 1px border, 16px radius, square thumbnail on the left
 * (130px at ≥450px viewports, 110px at ≥400px, 90px below), then domain /
 * title / description at 15px with a 12px inset and 2px gaps.
 * Large ("summary_large_image"): the image with the title in a dark pill at
 * the bottom-left, and "From domain" underneath. On x.com (2026-10-07, test 20)
 * the pill is 20px high with 8px sides and 13px text (16px line, centred), "From domain" is 13/16
 * secondary 4px under the card, and neither card has a fill of its own.
 * iOS app (iPhone 15 Pro captures of tests 07 and 20–31, 2026-10-08): the pill 8pt from the
 * image's left and bottom, ~18pt high, black at 50%, 13pt text at the body's tracking, ending at
 * least 24pt short of the right edge; "From domain" at 13pt, 12pt in from the card's left; no card
 * fill; the small card a 322×81 box with an 80pt thumbnail, the title above the domain and no
 * description. Android and the iOS post screen keep the earlier layout values, unmeasured; Android
 * draws no card fill (its colours: theme.ts).
 */
export function LinkCard({ card, theme, width, viewport, font: fontKind, web, ios, android }: Props) {
  const font = { fontFamily: fontStack(fontKind), fontSize: 15, lineHeight: "20px" } as const;
  const frame: React.CSSProperties = {
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 16,
    overflow: "hidden",
    width,
    boxSizing: "border-box",
    backgroundColor: web || ios || android ? undefined : theme.cardBg,
  };

  if (card === "loading") {
    return (
      <div style={{ ...frame, backgroundColor: theme.cardBg, height: 132, display: "flex", alignItems: "center", justifyContent: "center", color: theme.secondary, ...font }}>
        Fetching preview…
      </div>
    );
  }

  if (card.layout === "large" && card.image) {
    return (
      <div style={{ width }}>
        <div data-card="" style={{ ...frame, position: "relative", aspectRatio: "1.91 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div
            style={{
              position: "absolute",
              // iOS: 8pt and 24pt from the card's outer edges; offsets here start inside its 1px border.
              left: ios ? 7 : 12,
              bottom: ios ? 7 : 12,
              maxWidth: ios ? "calc(100% - 30px)" : "calc(100% - 24px)",
              boxSizing: "border-box",
              height: ios ? 18 : 20,
              padding: web ? "0 8px" : "0 4px",
              borderRadius: 4,
              backgroundColor: ios ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.77)",
              color: "#fff",
              fontFamily: fontStack(fontKind),
              fontSize: 13,
              letterSpacing: ios ? "var(--ls-app)" : undefined,
              lineHeight: ios ? "18px" : "20px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {card.title}
          </div>
        </div>
        <div style={{ ...font, ...(web || ios ? { fontSize: 13, lineHeight: "16px" } : {}), paddingLeft: ios ? 12 : 0, color: theme.secondary, marginTop: 4, ...clamp(1) }}>From {card.host}</div>
      </div>
    );
  }

  const thumb = ios ? 80 : viewport >= 450 ? 130 : viewport >= 400 ? 110 : 90;
  const titleLines = ios || viewport < 450 ? 2 : 1;
  const descLines = ios ? 0 : viewport >= 450 ? 2 : viewport >= 400 ? 1 : 0;
  const host = <div style={{ color: theme.cardHost, ...clamp(1) }}>{card.host}</div>;
  return (
    <div data-card="" style={{ ...frame, display: "flex" }}>
      {/* iOS: the app's hairline border lies over the thumbnail's edge (81 outer for an 80 thumbnail), so the 1px border here takes a row from it. */}
      <div data-card-thumb="" style={{ width: thumb, height: ios ? thumb - 1 : thumb, flexShrink: 0, borderRight: `1px solid ${theme.cardBorder}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: theme.secondary }}>
        {card.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <LinkIcon size={32} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, padding: ios ? "0 12px" : 12, minWidth: 0, flex: 1, ...font }}>
        {!ios && host}
        <div style={{ color: theme.text, ...clamp(titleLines) }}>{card.title}</div>
        {ios && host}
        {descLines > 0 && card.description && <div style={{ color: theme.secondary, ...clamp(descLines) }}>{card.description}</div>}
      </div>
    </div>
  );
}
