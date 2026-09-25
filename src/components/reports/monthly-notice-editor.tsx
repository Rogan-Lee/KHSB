"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement, updateAnnouncement } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Pencil, Check, Loader2, FileText } from "lucide-react";
import { EmptyState } from "@/components/backoffice/ui";
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
      <div className="flex flex-col gap-x2">
        <MarkdownEditor value={content} onChange={setContent} placeholder={`${label} 작성...`} />
        <div className="flex justify-end gap-x2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setContent(initial?.content ?? "");
              setEditing(false);
            }}
            disabled={saving}
          >
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="rounded-r3 border border-dashed border-stroke-neutral-weak">
        <EmptyState
          compact
          icon={FileText}
          title="작성된 내용이 없어요"
          action={
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              작성하기
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-x2">
      <div className="rounded-r3 bg-bg-layer-fill p-x4">
        <MarkdownViewer source={initial.content} />
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          수정
        </Button>
      </div>
    </div>
  );
}
