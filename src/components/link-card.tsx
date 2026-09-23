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
 * the bottom-left, and "From domain" underneath.
 */
export function LinkCard({ card, theme, width, viewport, font: fontKind }: Props) {
  const font = { fontFamily: fontStack(fontKind), fontSize: 15, lineHeight: "20px" } as const;
  const frame: React.CSSProperties = {
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 16,
    overflow: "hidden",
    width,
    boxSizing: "border-box",
    backgroundColor: theme.cardBg,
  };

  if (card === "loading") {
    return (
      <div style={{ ...frame, height: 132, display: "flex", alignItems: "center", justifyContent: "center", color: theme.secondary, ...font }}>
        Fetching preview…
      </div>
    );
  }

  if (card.layout === "large" && card.image) {
    return (
      <div style={{ width }}>
        <div style={{ ...frame, position: "relative", aspectRatio: "1.91 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              maxWidth: "calc(100% - 24px)",
              height: 20,
              padding: "0 4px",
              borderRadius: 4,
              backgroundColor: "rgba(0,0,0,0.77)",
              color: "#fff",
              fontFamily: fontStack(fontKind),
              fontSize: 13,
              lineHeight: "20px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {card.title}
          </div>
        </div>
        <div style={{ ...font, color: theme.secondary, marginTop: 4, ...clamp(1) }}>From {card.host}</div>
      </div>
    );
  }

  const thumb = viewport >= 450 ? 130 : viewport >= 400 ? 110 : 90;
  const titleLines = viewport >= 450 ? 1 : 2;
  const descLines = viewport >= 450 ? 2 : viewport >= 400 ? 1 : 0;
  return (
    <div style={{ ...frame, display: "flex" }}>
      <div style={{ width: thumb, height: thumb, flexShrink: 0, borderRight: `1px solid ${theme.cardBorder}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: theme.secondary }}>
        {card.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <LinkIcon size={32} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, padding: 12, minWidth: 0, flex: 1, ...font }}>
        <div style={{ color: theme.secondary, ...clamp(1) }}>{card.host}</div>
        <div style={{ color: theme.text, ...clamp(titleLines) }}>{card.title}</div>
        {descLines > 0 && card.description && <div style={{ color: theme.secondary, ...clamp(descLines) }}>{card.description}</div>}
      </div>
    </div>
  );
}
