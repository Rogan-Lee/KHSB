"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement, updateAnnouncement } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  page: string;
  label: string;
  initial: { id: string; title: string; content: string } | null;
}

export function MonthlyNoticeEditor({ page, label, initial }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initial?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSave() {
    setSaving(true);
    try {
      if (initial) {
        await updateAnnouncement(initial.id, initial.title || label, content);
      } else {
        await createAnnouncement(page, label, content);
      }
      toast.success("저장되었습니다");
      setEditing(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <MarkdownEditor value={content} onChange={setContent} placeholder={`${label} 작성...`} />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setContent(initial?.content ?? "");
              setEditing(false);
            }}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            저장
          </Button>
        </div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">작성된 내용이 없습니다</p>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1" />
          작성
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-md border bg-muted/30 p-3">
        <MarkdownViewer source={initial.content} />
      </div>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="mt-2">
        <Pencil className="h-3.5 w-3.5 mr-1" />
        수정
      </Button>
    </div>
  );
}
