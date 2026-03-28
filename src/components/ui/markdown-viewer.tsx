"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import "./notion-editor.css";

interface Props {
  source: string;
  className?: string;
}

export function MarkdownViewer({ source, className }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExt.configure({ inline: false, HTMLAttributes: { class: "rounded-lg max-w-full my-2" } }),
      Markdown.configure({ html: false }),
    ],
    content: source || "",
    editable: false,
    immediatelyRender: false,
  });

  if (!source) {
    return <span className="text-muted-foreground italic text-sm">내용 없음</span>;
  }

  return (
    <div className={className}>
      <EditorContent editor={editor} className="notion-editor-content" />
    </div>
  );
}
