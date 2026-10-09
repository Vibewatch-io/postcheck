"use client";

import { forwardRef } from "react";
import { emailRanges, styleAt, type StyleRun, type Token } from "@/lib/entities";
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
  /** Phones only: which X app draws it (Android wraps differently, see below). */
  platform?: "ios" | "android";
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
 * Premium bold is weight 700 (Chirp Bold) and italic a synthesized slant of the same face, on x.com
 * and in the iOS app wherever the app shows styling at all (its post screen and an expanded row:
 * tests 70, 70b; one older capture of Write/status/1646674962055565319 showed upright bold). The iOS
 * timeline row shows none: see rowHidesStyles.
 */
function styleCss(st: { bold: boolean; italic: boolean }): React.CSSProperties {
  return { ...(st.bold ? { fontWeight: 700 } : {}), ...(st.italic ? { fontStyle: "italic" as const } : {}) };
}

/** The email addresses inside each word (offsets into the word's text), by token index: the iOS app draws them in link blue. */
function emailParts(tokens: Token[]): Map<number, Array<[number, number]>> {
  const out = new Map<number, Array<[number, number]>>();
  for (let i = 0; i < tokens.length; ) {
    if (tokens[i].kind !== "word") { i++; continue; }
    // A style cut splits a word into several tokens; an address can run across them.
    let j = i;
    while (j + 1 < tokens.length && tokens[j + 1].kind === "word" && tokens[j + 1].start === tokens[j].end) j++;
    const run = tokens.slice(i, j + 1) as Array<Extract<Token, { kind: "word" }>>;
    const base = run[0].start;
    for (const [s, e] of emailRanges(run.map((t) => t.text).join(""))) {
      run.forEach((t, k) => {
        const a = Math.max(base + s, t.start) - t.start, b = Math.min(base + e, t.end) - t.start;
        if (a < b) out.set(i + k, [...(out.get(i + k) ?? []), [a, b]]);
      });
    }
    i = j + 1;
  }
  return out;
}

export const PostBody = forwardRef<HTMLDivElement, Props>(function PostBody(
  { tokens, showMoreAt, onShowMore, hiddenUrlStart, theme, fontSize, lineHeight, width, font, pane, platform, styles = [], linkColor = theme.link, maxLines },
  ref,
) {
  let paragraph = 0;
  const nodes: React.ReactNode[] = [];
  const android = platform === "android";
  // The Android app never breaks after a hyphen: "end-to-end" wraps whole, and a word too long for the
  // column breaks at the last character that fits ("…-and-th" | "en-some-…", @postcheck_test tests 15 and
  // 16 on a Pixel 3). A word joiner after each hyphen, drawn by CSS so the text nodes keep the post's own
  // characters for the line probe, takes the break away; overflow-wrap still breaks an over-long word.
  const keepHyphens = (text: string) =>
    android && text.includes("-") ? text.split(/(-)/).map((s, j) => (s === "-" ? <span key={j} className="nb-hyphen">-</span> : s)) : text;
  const end = showMoreAt >= 0 ? showMoreAt : tokens.length;
  const emails = pane === "app" ? emailParts(tokens) : new Map<number, Array<[number, number]>>();

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
      // Both apps break a link that doesn't fit after a "/" ("…/us/app/x/" | "id333…", @postcheck_test
      // test 122b on iOS; "x.com/" | "Postcheck_test…", tests 40–44 on Android); the browser never breaks there on its own.
      const text =
        (pane === "app" || android) && t.entity.type === "url"
          ? t.text.split(/(?<=\/)(?=.)/).flatMap((s, j) => (j ? [<wbr key={`b${j}`} />, <span key={j}>{keepHyphens(s)}</span>] : [<span key={j}>{keepHyphens(s)}</span>]))
          : t.entity.type === "url" ? t.text : keepHyphens(t.text);
      nodes.push(
        <span key={i} data-w="1" data-link={t.entity.type === "url" ? t.start : undefined} data-p={paragraph} data-e={t.end} style={{ color: linkColor }}>
          {text}
        </span>,
      );
      return;
    }
    let text: React.ReactNode = keepHyphens(t.text);
    const parts = emails.get(i);
    if (parts) {
      const out: React.ReactNode[] = [];
      let at = 0;
      for (const [a, b] of parts) {
        if (a > at) out.push(<span key={`p${at}`}>{keepHyphens(t.text.slice(at, a))}</span>);
        out.push(<span key={a} style={{ color: linkColor }}>{keepHyphens(t.text.slice(a, b))}</span>);
        at = b;
      }
      if (at < t.text.length) out.push(<span key={`p${at}`}>{keepHyphens(t.text.slice(at))}</span>);
      text = out;
    }
    nodes.push(
      <span key={i} data-w="1" data-p={paragraph} data-e={t.end} style={styleCss(styleAt(styles, t.start))}>
        {text}
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
            // Android wraps the token like two words ("…lazy dog Show" | "more", test 05 on a Pixel 3).
            style={{ color: theme.link, display: android ? "inline" : "inline-block", cursor: onShowMore ? "pointer" : undefined }}
          >
            Show more
          </span>
        </>
      )}
    </div>
  );
});
