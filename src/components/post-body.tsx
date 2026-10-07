"use client";

import { forwardRef } from "react";
import { styleAt, type StyleRun, type Token } from "@/lib/entities";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";

interface Props {
  tokens: Token[];
  /** Tokens past this index are folded behind "Show more" (-1 = none). */
  showMoreAt: number;
  /** Makes "Show more" a button; x.com's expands the whole text in place. */
  onShowMore?: () => void;
  /** URL entity start offset whose text is hidden (trailing card link). */
  hiddenUrlStart: number | null;
  theme: XTheme;
  fontSize: number;
  lineHeight: number;
  width?: number;
  /** Which Chirp build to lay out with (web client or app). */
  font: "web" | "app";
  /** Which calibrated tracking variable applies (see globals.css). */
  pane?: "web" | "app";
  /** Premium bold / italic runs over the text. */
  styles?: StyleRun[];
  /** Colour for links, mentions, hashtags and cashtags (X's blue unless given). */
  linkColor?: string;
  /** Show at most this many lines, ending the last with "…" (quote embeds). */
  maxLines?: number;
}

/**
 * Renders post text the way X lays it out: pre-wrap, break-word, links in
 * blue. Every word is wrapped in a span so line breaks can be read back from
 * the DOM (see line-probe.tsx); the spans change nothing visually.
 */
/**
 * x.com renders Premium bold at weight 700 (Chirp Bold) and italic as a
 * synthesized slant of the same face. The iOS app has no italic Chirp and
 * does not slant: an italic run shows upright in bold (observed on
 * Write/status/1646674962055565319, one sample).
 */
function styleCss(st: { bold: boolean; italic: boolean }, app: boolean): React.CSSProperties {
  if (app) return st.bold || st.italic ? { fontWeight: 700 } : {};
  return { ...(st.bold ? { fontWeight: 700 } : {}), ...(st.italic ? { fontStyle: "italic" as const } : {}) };
}

export const PostBody = forwardRef<HTMLDivElement, Props>(function PostBody(
  { tokens, showMoreAt, onShowMore, hiddenUrlStart, theme, fontSize, lineHeight, width, font, pane, styles = [], linkColor = theme.link, maxLines },
  ref,
) {
  let paragraph = 0;
  const nodes: React.ReactNode[] = [];
  const end = showMoreAt >= 0 ? showMoreAt : tokens.length;

  tokens.slice(0, end).forEach((t, i) => {
    if (t.kind === "newline") {
      paragraph++;
      nodes.push("\n");
      return;
    }
    if (t.kind === "space") {
      nodes.push(t.text);
      return;
    }
    if (t.kind === "entity") {
      if (t.entity.type === "url" && t.entity.start === hiddenUrlStart) return;
      // The iOS app breaks a link that doesn't fit after a "/" ("…/us/app/x/" | "id333…",
      // @postcheck_test test 122b); the browser never breaks there on its own.
      const text = pane === "app" && t.entity.type === "url" ? t.text.split(/(?<=\/)(?=.)/).flatMap((s, j) => (j ? [<wbr key={j} />, s] : [s])) : t.text;
      nodes.push(
        <span key={i} data-w="1" data-p={paragraph} data-e={t.end} style={{ color: linkColor }}>
          {text}
        </span>,
      );
      return;
    }
    nodes.push(
      <span key={i} data-w="1" data-p={paragraph} data-e={t.end} style={styleCss(styleAt(styles, t.start), pane === "app")}>
        {t.text}
      </span>,
    );
  });

  // Trailing whitespace before a hidden URL / show-more would render as a
  // dangling space; X trims it.
  while (nodes.length && typeof nodes[nodes.length - 1] === "string" && (nodes[nodes.length - 1] as string).trim() === "") {
    nodes.pop();
  }

  return (
    <div
      ref={ref}
      dir="auto"
      style={{
        fontFamily: fontStack(font),
        letterSpacing: pane ? `var(--ls-${pane})` : undefined,
        fontSize,
        lineHeight: `${lineHeight}px`,
        fontWeight: 400,
        color: theme.text,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "break-word",
        width,
        maxWidth: "100%",
        ...(maxLines ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: maxLines, overflow: "hidden" } : {}),
      }}
    >
      {nodes}
      {showMoreAt >= 0 && (
        <>
          {" "}
          <span
            data-more="1"
            role={onShowMore ? "button" : undefined}
            tabIndex={onShowMore ? 0 : undefined}
            onClick={onShowMore}
            onKeyDown={onShowMore ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onShowMore()) : undefined}
            style={{ color: theme.link, display: "inline-block", cursor: onShowMore ? "pointer" : undefined }}
          >
            Show more
          </span>
        </>
      )}
    </div>
  );
});
