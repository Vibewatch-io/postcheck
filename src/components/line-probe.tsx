"use client";

import { useLayoutEffect, useRef } from "react";
import { rowHidesStyles, type Device } from "@/lib/devices";
import type { StyleRun, Token } from "@/lib/entities";
import { THEMES, fontStack } from "@/lib/theme";
import type { DeviceLines, LineInfo } from "@/lib/advice";
import { PostBody } from "./post-body";

interface Props {
  tokens: Token[];
  showMore: boolean;
  hiddenUrlStart: number | null;
  devices: Device[];
  onMeasure: (lines: DeviceLines[]) => void;
  styles?: StyleRun[];
}

export function measureLines(root: HTMLElement, lineHeight: number): { lines: LineInfo[]; total: number } {
  const box = root.getBoundingClientRect();
  const total = Math.max(1, Math.round(box.height / lineHeight));
  // One slot per rendered row, blank rows included, so row N really is row N.
  const rows: LineInfo[] = Array.from({ length: total }, () => ({ words: [], paragraph: -1, end: 0, spans: [] }));
  for (const el of root.querySelectorAll<HTMLElement>("[data-w]")) {
    const rects = el.getClientRects();
    if (!rects.length) continue;
    const word = el.textContent || "";
    const paragraph = Number(el.dataset.p || 0);
    const end = Number(el.dataset.e || 0);
    // A link span holds its display text, not the posted URL, so its characters have no offsets in the
    // post: it is measured as one unit from its real start (`data-link`) to its end (see appFoldCut).
    const linkStart = el.dataset.link !== undefined ? Number(el.dataset.link) : null;
    const rowOf = (top: number) => Math.round((top - box.top) / lineHeight);
    const first = rowOf(rects[0].top);
    const last = rowOf(rects[rects.length - 1].top);
    if (first === last) {
      if (!rows[first]) continue;
      const r = rects[rects.length - 1];
      rows[first].words.push(word);
      rows[first].spans.push({ start: linkStart ?? end - word.length, end, left: r.left - box.left, right: r.right - box.left, ...(linkStart !== null ? { link: true } : {}) });
      rows[first].end = end;
      rows[first].paragraph = paragraph;
      continue;
    }
    // A span that wraps (a link broken after "/" on the app pane, a word after a hyphen, CJK): one
    // fragment per row, each with its own words, edges and end.
    const frags = new Map<number, { text: string; start: number; end: number; left: number; right: number }>();
    let at = end - word.length;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let i = 0;
      for (const ch of n.nodeValue ?? "") {
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + ch.length);
        const cr = range.getClientRects()[0];
        i += ch.length;
        const from = at;
        at += ch.length;
        if (!cr) continue;
        const f = frags.get(rowOf(cr.top));
        if (f) Object.assign(f, { text: f.text + ch, end: at, right: cr.right - box.left });
        else frags.set(rowOf(cr.top), { text: ch, start: from, end: at, left: cr.left - box.left, right: cr.right - box.left });
      }
    }
    // A row a link runs off ends at the link's start, so a fold there keeps the whole link behind Show
    // more; only the row it ends on can cut after it (assumed; no capture has a link across the fold).
    for (const [r, f] of frags) {
      if (!rows[r]) continue;
      rows[r].words.push(f.text);
      if (linkStart === null) rows[r].spans.push({ start: f.start, end: f.end, left: f.left, right: f.right });
      else if (r === last) rows[r].spans.push({ start: linkStart, end, left: f.left, right: f.right, link: true, cont: true });
      else rows[r].spans.push({ start: linkStart, end: linkStart, left: f.left, right: f.left, link: true });
      rows[r].end = r === last ? end : linkStart ?? f.end;
      rows[r].paragraph = paragraph;
    }
  }
  let carry = 0;
  for (const r of rows) {
    if (r.end) carry = r.end;
    else r.end = carry;
  }
  return { lines: rows, total };
}

/**
 * Invisible copies of the body at every device width. After layout (and again
 * once Chirp finishes loading) the word spans are read back to find where each
 * line actually breaks, so advice can name the dangling word on each device.
 */
export function LineProbes({ tokens, showMore, hiddenUrlStart, devices, onMeasure, styles }: Props) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const cb = useRef(onMeasure);
  useLayoutEffect(() => {
    cb.current = onMeasure;
  }, [onMeasure]);

  useLayoutEffect(() => {
    const run = () => {
      cb.current(
        devices.map((d, i) => {
          const el = refs.current[i]?.firstElementChild as HTMLElement | null;
          const m = el ? measureLines(el, d.lineHeight) : { lines: [], total: 0 };
          const token = refs.current[i]?.querySelector<HTMLElement>("[data-token]");
          return { deviceId: d.id, deviceLabel: d.tipLabel ?? d.label, view: d.view, lines: m.lines, total: m.total, tokenWidth: token?.getBoundingClientRect().width ?? 0 };
        }),
      );
    };
    run();
    const fonts = document.fonts;
    fonts.addEventListener("loadingdone", run);
    return () => fonts.removeEventListener("loadingdone", run);
  }, [tokens, showMore, hiddenUrlStart, devices, styles]);

  return (
    <div aria-hidden style={{ position: "absolute", left: -99999, top: 0, visibility: "hidden", pointerEvents: "none" }}>
      {devices.map((d, i) => (
        <div
          key={d.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          {/* The app never appends the web's 280-cut "Show more": a long post under 10 lines shows whole
              there, so counting the token would push a full last line onto a 10th row (test 94). */}
          <PostBody tokens={tokens} showMoreAt={showMore && d.pane === "web" ? tokens.length : -1} hiddenUrlStart={hiddenUrlStart} theme={THEMES.light} fontSize={d.fontSize} lineHeight={d.lineHeight} width={d.textWidth} font={d.font} pane={d.pane} styles={rowHidesStyles(d) ? [] : styles} />
          <span data-token style={{ position: "absolute", whiteSpace: "pre", fontFamily: fontStack(d.font), fontSize: d.fontSize, lineHeight: `${d.lineHeight}px`, letterSpacing: `var(--ls-${d.pane})` }}>
            {" Show more"}
          </span>
        </div>
      ))}
    </div>
  );
}
