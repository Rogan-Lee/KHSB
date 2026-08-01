"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";
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

  // source prop 이 바뀌면 에디터 내용을 갱신한다.
  // (useEditor 의 content 는 최초 마운트에만 반영되므로, 좌우 넘기기·리스트 선택 시 본문이 안 바뀌던 버그 수정)
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(source || "");
    }
  }, [editor, source]);

  if (!source) {
    return <span className="text-muted-foreground italic text-sm">내용 없음</span>;
  }

  return (
    <div className={className}>
      <EditorContent editor={editor} className="notion-editor-content" />
    </div>
  );
}
