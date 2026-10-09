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
  /**
   * The Android app, with the body's size and line height: no card fill (tests 20–31), and its own small
   * card (tests 22, 24 and 121) and large card (tests 07, 20–21, 25–27, 29–31) at 360 and 411.4 dp, 2026-10-08. Null elsewhere.
   */
  android: { fontSize: number; lineHeight: number } | null;
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
 * description. The iOS post screen keeps the earlier values, unmeasured. Android (Pixel 3 captures of
 * tests 22, 24 and 121, 2026-10-08): the small card a 100dp-high box across the text column, radius 8,
 * no fill; a 100dp square thumbnail, then a divider in the row separator's colour; title (up to 2
 * lines seen) over the domain, both at the body's size, from 116dp to the card's right edge with no end
 * padding (the captured breaks need 167.4–174.3 at 360 and ≥ 218.4 at 411.4), centred vertically; no
 * description. Its large card (tests 07, 20–21, 25–27, 29–31, same captures): radius 12, the image filling a
 * 1.91:1 box; the pill 8dp from the card's left and right edges (a long title is cut with "…") and 6dp from its
 * bottom, radius 8, black at 70%, 4dp sides, white text; "From domain" in the secondary colour, its text 8dp in
 * and its ink 4.3–4.6dp under the card. The pill and line grow with the ≥400dp layout: text 13.2 → 13.7dp (fitted
 * to the captured ink widths against Chirp), pill 19.33 → 20.57dp high. Android's colours: theme.ts.
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
    // Android's two layouts (body 15 below 400dp, 16 from there): the pill's and the "From" line's text size, the
    // pill's height and the line's top margin (it puts the ink 4.33 and 4.57dp under the card on a 16px line).
    const big = android && (android.fontSize >= 16 ? { size: 13.7, pill: 20.57, top: 2 } : { size: 13.2, pill: 19.33, top: 1.6 });
    return (
      <div style={{ width }}>
        <div data-card="" style={{ ...frame, ...(big ? { borderRadius: 12 } : {}), position: "relative", aspectRatio: "1.91 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div
            data-card-pill=""
            style={{
              position: "absolute",
              // iOS: 8pt and 24pt from the card's outer edges; Android: 8dp, 8dp and 6dp. Offsets here start inside its 1px border.
              left: ios || big ? 7 : 12,
              bottom: ios ? 7 : big ? 5 : 12,
              maxWidth: ios ? "calc(100% - 30px)" : big ? "calc(100% - 14px)" : "calc(100% - 24px)",
              boxSizing: "border-box",
              height: ios ? 18 : big ? big.pill : 20,
              padding: web ? "0 8px" : "0 4px",
              borderRadius: big ? 8 : 4,
              backgroundColor: ios ? "rgba(0,0,0,0.5)" : big ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.77)",
              color: "#fff",
              fontFamily: fontStack(fontKind),
              fontSize: big ? big.size : 13,
              letterSpacing: ios ? "var(--ls-app)" : big ? "var(--ls-web)" : undefined,
              lineHeight: ios ? "18px" : big ? `${big.pill}px` : "20px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {card.title}
          </div>
        </div>
        <div
          style={{
            ...font,
            ...(web || ios ? { fontSize: 13, lineHeight: "16px" } : big ? { fontSize: big.size, lineHeight: "16px", letterSpacing: "var(--ls-web)" } : {}),
            paddingLeft: ios ? 12 : big ? 8 : 0,
            color: theme.secondary,
            marginTop: big ? big.top : 4,
            ...clamp(1),
          }}
        >
          From {card.host}
        </div>
      </div>
    );
  }

  if (android) {
    const text = { fontFamily: fontStack(fontKind), fontSize: android.fontSize, lineHeight: `${android.lineHeight}px`, letterSpacing: "var(--ls-web)" } as const;
    // 1px border + 99 thumbnail + 1px divider + 15 = the text's 116dp. The captures' border and divider are
    // device-pixel hairlines (0.33 and 0.67dp), so the thumbnail reads 99.3dp there.
    return (
      <div data-card="" style={{ ...frame, borderRadius: 8, height: 100, display: "flex" }}>
        <div data-card-thumb="" style={{ width: 99, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: theme.secondary }}>
          {card.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <LinkIcon size={32} />
          )}
        </div>
        <div style={{ ...text, borderLeft: `1px solid ${theme.border}`, paddingLeft: 15, minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
          <div style={{ color: theme.text, ...clamp(2) }}>{card.title}</div>
          <div style={{ color: theme.cardHost, ...clamp(1) }}>{card.host}</div>
        </div>
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
