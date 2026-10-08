"use client";

import { wrappingInputRule } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Italic from "@tiptap/extension-italic";
import { BulletList, ListItem, ListKeymap } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Slice } from "@tiptap/pm/model";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useId, useRef, useState } from "react";
import { draftToDoc, serializeDoc, type Draft, type DocNode } from "@/lib/draft";
import { REPLY_LIMITS, TAG_MAX, hasPostState, type PostState, type ReplyLimit } from "@/lib/post-state";
import type { MediaItem } from "@/lib/media";

// X's composer styles text in place; typed markdown markers stay literal text.
const extensions = [
  Document,
  Paragraph,
  Text,
  Bold.extend({ addInputRules: () => [], addPasteRules: () => [] }),
  Italic.extend({ addInputRules: () => [], addPasteRules: () => [] }),
  // "* " at the start of a line starts a bullet list; one level only, since X posts it as "• " lines.
  BulletList.extend({ addInputRules() { return [wrappingInputRule({ find: /^\s*\*\s$/, type: this.type })]; } }),
  ListItem.extend({ content: "paragraph" }),
  ListKeymap,
  UndoRedo,
];

/** The composer's editor. `onChange` receives the post as X would store it (plain text + style runs). */
export function useComposer(onChange: (draft: Draft) => void) {
  return useEditor({
    extensions,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(serializeDoc(editor.getJSON() as DocNode)),
    editorProps: {
      attributes: {
        "aria-label": "Post text",
        "aria-multiline": "true",
        role: "textbox",
        class: "composer min-h-[clamp(112px,22vh,232px)] w-full px-5 py-4 font-sans text-base leading-7 text-brand-warm-dark outline-hidden",
      },
      // Plain-text paste keeps every line break (ProseMirror's default collapses blank lines).
      clipboardTextParser: (text, _context, _plain, view) => {
        const doc = view.state.schema.nodeFromJSON(draftToDoc(text.replace(/\r\n?/g, "\n")));
        return new Slice(doc.content, 1, 1);
      },
      clipboardTextSerializer: (slice) => serializeDoc({ type: "doc", content: slice.content.toJSON() ?? [] }).text,
    },
  });
}

/**
 * The editor with a multi-line placeholder. Editor, placeholder and an invisible copy of the
 * placeholder share one grid cell: the copy is always there, so the box is always tall enough for
 * the whole placeholder (it never clips) and focusing or typing never changes its height. The
 * visible placeholder goes as soon as the editor is focused or has text.
 */
export function ComposerField({ editor, placeholder }: { editor: Editor | null; placeholder: string }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({ empty: e?.isEmpty ?? true, focused: e?.isFocused ?? false }) });
  const showPlaceholder = (state?.empty ?? true) && !state?.focused;
  const text = "whitespace-pre-wrap px-5 py-4 font-sans text-base leading-7 [grid-area:1/1]";
  return (
    <div
      className="grid cursor-text rounded-xl border border-brand-warm-border bg-white focus-within:border-brand-teal"
      // A click in the box below the text still lands in the editor.
      onMouseDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest(".ProseMirror")) return;
        e.preventDefault();
        editor?.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} className="min-w-0 [grid-area:1/1]" />
      <div aria-hidden className={`invisible ${text}`}>{placeholder}</div>
      {showPlaceholder && <div aria-hidden className={`pointer-events-none text-brand-warm-muted ${text}`}>{placeholder}</div>}
    </div>
  );
}

const btn = "h-9 w-9 rounded-lg border text-sm text-brand-warm-dark hover:bg-brand-warm-surface";

/** Bold / italic / bullet buttons, shown under the editor. */
export function FormatBar({ editor }: { editor: Editor | null }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e?.isActive("bold") ?? false, italic: e?.isActive("italic") ?? false, bullet: e?.isActive("bulletList") ?? false }),
  });
  const cls = (on: boolean | undefined) => `${btn} ${on ? "border-brand-teal bg-brand-teal/10" : "border-brand-warm-border"}`;
  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Formatting">
      <button type="button" disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Premium)" aria-label="Bold" aria-pressed={active?.bold} className={`${cls(active?.bold)} font-bold`}>
        B
      </button>
      <button type="button" disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Premium)" aria-label="Italic" aria-pressed={active?.italic} className={`${cls(active?.italic)} italic`}>
        I
      </button>
      <button type="button" disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list (posts as • lines)" aria-label="Bullet list" aria-pressed={active?.bullet} className={cls(active?.bullet)}>
        •
      </button>
    </div>
  );
}


/** X's composer wording for "Who can reply". */
const REPLY_LABELS: Record<ReplyLimit, string> = {
  everyone: "Everyone",
  following: "Accounts you follow",
  verified: "Verified accounts",
  mentioned: "Only accounts you mention",
};

/**
 * The post states X draws (pinned, paid partnership, reply limit, and the media's sensitive flag,
 * tag and per-photo alt text), tucked behind one button so the composer stays plain. A dot on the
 * button says something is set.
 */
export function PostOptions({ state, onChange, media, onMedia }: { state: PostState; onChange: (s: PostState) => void; media: MediaItem[]; onMedia: (update: (m: MediaItem[]) => MediaItem[]) => void }) {
  const hasImage = media.length > 0;
  // x.com badges alt text on photos only (test 58); a GIF or video was never captured with it.
  const photos = media.flatMap((m, i) => (m.kind === "photo" ? [{ m, i }] : []));
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const set = (patch: Partial<PostState>) => onChange({ ...state, ...patch });
  /**
   * One checkbox per item for a flag X sets per item in its composer (alt text; the content warning),
   * each next to its thumbnail when there are several.
   */
  const perItem = (label: string, flag: "alt" | "sensitive", items: Array<{ m: MediaItem; i: number }>) => (
    <div className={row}>
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {items.map(({ m, i }, k) => {
          const name = `${items.length > 1 ? `Item ${k + 1}` : "Media"}: ${label.toLowerCase()}`;
          return (
            <label key={i} className="flex cursor-pointer items-center gap-1" title={name}>
              {items.length > 1 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.src} alt="" className="h-6 w-6 rounded object-cover" />
              )}
              <input type="checkbox" className={box} aria-label={name} checked={Boolean(m[flag])} onChange={(e) => onMedia((all) => all.map((x, j) => (j === i ? { ...x, [flag]: e.target.checked } : x)))} />
            </label>
          );
        })}
      </span>
    </div>
  );
  const row = "flex min-h-9 items-center justify-between gap-3 text-sm text-brand-warm-dark";
  const box = "h-4 w-4 accent-brand-teal";
  return (
    // From sm up the panel hangs under the button; on a phone, under the toolbar (the nearest
    // positioned box). Its cap is the screen, never the 36px box it hangs from.
    <div ref={root} className="sm:relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Post options"
        aria-label="Post options"
        aria-expanded={open}
        aria-controls={id}
        className={`${btn} relative flex items-center justify-center ${open ? "border-brand-teal bg-brand-teal/10" : "border-brand-warm-border"}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
          <circle cx="15" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
        {(hasPostState(state) || media.some((m) => m.alt || m.sensitive)) && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-teal" />}
      </button>
      {open && (
        <div id={id} role="group" aria-label="Post options" className="absolute left-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl sm:top-11 sm:mt-0 border border-brand-warm-border bg-white px-4 py-2 shadow-lg">
          <label className={row}>
            Pinned
            <input type="checkbox" className={box} checked={state.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
          </label>
          <label className={row}>
            Paid partnership
            <input type="checkbox" className={box} checked={state.paid} onChange={(e) => set({ paid: e.target.checked })} />
          </label>
          <label className={row}>
            <span className="whitespace-nowrap">Who can reply</span>
            <select value={state.replies} onChange={(e) => set({ replies: e.target.value as ReplyLimit })} className="min-w-0 max-w-48 rounded-lg border border-brand-warm-border bg-white px-2 py-1 text-sm">
              {REPLY_LIMITS.map((r) => (
                <option key={r} value={r}>
                  {REPLY_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="my-1 border-t border-brand-warm-border" />
          {hasImage ? (
            <>
              {perItem("Sensitive", "sensitive", media.map((m, i) => ({ m, i })))}
              <label className={row}>
                Tagged
                <input
                  value={state.tagged}
                  maxLength={TAG_MAX}
                  placeholder="Display names"
                  title="Display names of the people tagged, separated by commas"
                  autoComplete="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  onChange={(e) => set({ tagged: e.target.value })}
                  className="w-40 rounded-lg border border-brand-warm-border px-2 py-1 text-sm outline-hidden placeholder:text-brand-warm-muted focus:border-brand-teal"
                />
              </label>
              {photos.length > 0 && perItem("Alt text", "alt", photos)}
            </>
          ) : (
            <p className="py-2 text-xs text-brand-warm-secondary">Add media to mark it sensitive, tag someone or add alt text.</p>
          )}
        </div>
      )}
    </div>
  );
}
