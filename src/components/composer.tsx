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
import { draftToDoc, serializeDoc, type Draft, type DocNode } from "@/lib/draft";

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
        class: "composer min-h-[clamp(96px,20vh,204px)] w-full rounded-xl border border-brand-warm-border bg-white px-4 py-3 font-sans text-base leading-7 text-brand-warm-dark outline-hidden focus:border-brand-teal",
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
 * The editor with a multi-line placeholder. The placeholder sits in normal flow (so the box grows to fit it)
 * with the editor laid over it, and disappears as soon as the editor is focused or has text.
 */
export function ComposerField({ editor, placeholder }: { editor: Editor | null; placeholder: string }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({ empty: e?.isEmpty ?? true, focused: e?.isFocused ?? false }) });
  // The placeholder is laid over the editor, so focusing or typing never changes the box's height.
  const showPlaceholder = (state?.empty ?? true) && !state?.focused;
  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {showPlaceholder && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap border border-transparent px-4 py-3 font-sans text-base leading-7 text-brand-warm-muted">
          {placeholder}
        </div>
      )}
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

