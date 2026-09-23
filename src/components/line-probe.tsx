"use client";

import { useLayoutEffect, useRef } from "react";
import type { Device } from "@/lib/devices";
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
    const first = Math.round((rects[0].top - box.top) / lineHeight);
    const last = Math.round((rects[rects.length - 1].top - box.top) / lineHeight);
    if (!rows[first]) continue;
    rows[first].words.push(word);
    const lastRect = rects[rects.length - 1];
    (rows[last] ?? rows[first]).spans.push({ start: end - word.length, end, left: lastRect.left - box.left, right: lastRect.right - box.left });
    for (let r = first; r <= last && rows[r]; r++) {
      rows[r].end = end;
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
          return { deviceId: d.id, deviceLabel: d.label, view: d.view, lines: m.lines, total: m.total, tokenWidth: token?.getBoundingClientRect().width ?? 0 };
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
          <PostBody tokens={tokens} showMoreAt={showMore ? tokens.length : -1} hiddenUrlStart={hiddenUrlStart} theme={THEMES.light} fontSize={d.fontSize} lineHeight={d.lineHeight} width={d.textWidth} font={d.font} pane={d.pane} styles={styles} />
          <span data-token style={{ position: "absolute", whiteSpace: "pre", fontFamily: fontStack(d.font), fontSize: d.fontSize, lineHeight: `${d.lineHeight}px`, letterSpacing: `var(--ls-${d.pane})` }}>
            {" Show more"}
          </span>
        </div>
      ))}
    </div>
  );
}
