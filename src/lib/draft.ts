import type { StyleRun } from "./entities";

/** The subset of the editor's JSON document the composer produces. */
export interface DocNode {
  type: string;
  text?: string;
  marks?: Array<{ type: string }>;
  content?: DocNode[];
}

export interface Draft {
  text: string;
  styles: StyleRun[];
}

/** X has no lists: a bullet posts as this prefix on its own line. */
export const BULLET = "• ";

/**
 * Editor document → what X posts: one line per paragraph or list item (list items
 * prefixed with "• "), bold / italic marks as style runs over the plain text.
 */
export function serializeDoc(doc: DocNode): Draft {
  const lines: DocNode[][] = [];
  const prefixes: string[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === "bulletList") {
      for (const item of block.content ?? []) {
        lines.push((item.content ?? []).flatMap((p) => p.content ?? []));
        prefixes.push(BULLET);
      }
    } else {
      lines.push(block.content ?? []);
      prefixes.push("");
    }
  }
  let text = "";
  const styles: StyleRun[] = [];
  lines.forEach((inline, i) => {
    if (i > 0) text += "\n";
    text += prefixes[i];
    for (const node of inline) {
      const value = node.type === "text" ? (node.text ?? "") : "";
      const start = text.length;
      text += value;
      const marks = new Set((node.marks ?? []).map((m) => m.type));
      if (value && marks.has("bold")) styles.push({ start, end: text.length, bold: true, italic: false });
      if (value && marks.has("italic")) styles.push({ start, end: text.length, bold: false, italic: true });
    }
  });
  return { text, styles: mergeRuns(styles) };
}

/** Plain text (plus optional style runs) → editor document. Consecutive "• " lines become a bullet list. */
export function draftToDoc(text: string, styles: StyleRun[] = []): DocNode {
  const content: DocNode[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const bullet = line.startsWith(BULLET);
    const bodyStart = offset + (bullet ? BULLET.length : 0);
    const paragraph: DocNode = { type: "paragraph", content: inlineNodes(text.slice(bodyStart, offset + line.length), bodyStart, styles) };
    if (!paragraph.content!.length) delete paragraph.content;
    if (bullet) {
      const last = content[content.length - 1];
      const item = { type: "listItem", content: [paragraph] };
      if (last?.type === "bulletList") last.content!.push(item);
      else content.push({ type: "bulletList", content: [item] });
    } else {
      content.push(paragraph);
    }
    offset += line.length + 1;
  }
  return { type: "doc", content };
}

/**
 * The draft as X stores it: outer whitespace trimmed, and runs of blank lines collapsed to one
 * (posted "a\n\n\n\nb" is stored as "a\n\nb": @postcheck_test/status/2100300298313183628).
 * Spaces inside a line are kept. Style runs stay on the same characters.
 */
export function trimDraft({ text, styles }: Draft): Draft {
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  // newIndex[i] = position of trimmed[i] in the output (or of the next kept character if dropped).
  let out = "";
  const newIndex: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    newIndex.push(out.length);
    if (trimmed[i] === "\n" && out.endsWith("\n\n")) continue;
    out += trimmed[i];
  }
  newIndex.push(out.length);
  const map = (at: number) => newIndex[Math.max(0, Math.min(trimmed.length, at - lead))];
  return {
    text: out,
    styles: styles.map((r) => ({ ...r, start: map(r.start), end: map(r.end) })).filter((r) => r.end > r.start),
  };
}

function inlineNodes(segment: string, base: number, styles: StyleRun[]): DocNode[] {
  if (!segment) return [];
  const end = base + segment.length;
  const cuts = new Set([base, end]);
  for (const r of styles) {
    if (r.start > base && r.start < end) cuts.add(r.start);
    if (r.end > base && r.end < end) cuts.add(r.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const nodes: DocNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const on = styles.filter((r) => r.start <= a && b <= r.end);
    const marks = [...(on.some((r) => r.bold) ? [{ type: "bold" }] : []), ...(on.some((r) => r.italic) ? [{ type: "italic" }] : [])];
    nodes.push({ type: "text", text: segment.slice(a - base, b - base), ...(marks.length ? { marks } : {}) });
  }
  return nodes;
}

/** Adjacent runs of the same style (split by the editor across nodes) become one. */
function mergeRuns(runs: StyleRun[]): StyleRun[] {
  const out: StyleRun[] = [];
  for (const kind of [true, false]) {
    const same = runs.filter((r) => r.bold === kind).sort((a, b) => a.start - b.start);
    for (const r of same) {
      const prev = out[out.length - 1];
      if (prev && prev.bold === kind && prev.end === r.start) prev.end = r.end;
      else out.push({ ...r });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
