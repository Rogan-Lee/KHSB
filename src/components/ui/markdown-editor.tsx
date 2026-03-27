"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import "./notion-editor.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const isInternalRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExt.configure({ inline: false, HTMLAttributes: { class: "rounded-lg max-w-full my-2" } }),
      Placeholder.configure({
        placeholder: placeholder ?? "내용을 입력하세요... (# 제목, **굵게**, - 목록, > 인용 등)",
      }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value || "",
    immediatelyRender: false,
    onUpdate({ editor }) {
      isInternalRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((editor.storage as any).markdown.getMarkdown() as string);
    },
  });

  // Sync value from outside (e.g. form reset / edit open)
  useEffect(() => {
    if (!editor) return;
    if (isInternalRef.current) {
      isInternalRef.current = false;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown() as string;
    if (value !== current) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  async function handleImageFile(file: File) {
    if (!editor) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      editor.chain().focus().setImage({ src: json.url, alt: "이미지" }).run();
      toast.success("이미지가 첨부되었습니다");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleImageFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    e.preventDefault();
    handleImageFile(file);
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !editor}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          이미지 첨부
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <span className="ml-auto text-[11px] text-muted-foreground select-none">
          # 제목 &nbsp;·&nbsp; **굵게** &nbsp;·&nbsp; _기울임_ &nbsp;·&nbsp; - 목록 &nbsp;·&nbsp; &gt; 인용
        </span>
      </div>

      {/* Editable content */}
      <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <EditorContent
          editor={editor}
          className="notion-editor-content px-4 py-3 min-h-[200px] focus-within:outline-none"
        />
      </div>
    </div>
  );
}
