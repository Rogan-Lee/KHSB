"use client";

import { useState, useTransition } from "react";
import { upsertAnnouncement } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Megaphone, Pencil, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  announcement: {
    content: string;
    updatedAt: Date;
    author: { name: string };
  } | null;
  isDirector: boolean;
}

export function MentoringAnnouncement({ announcement, isDirector }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(announcement?.content ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAnnouncement("mentoring", content);
        setEditing(false);
        toast.success("공지사항이 저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleCancel() {
    setContent(announcement?.content ?? "");
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold text-base">이번 주 공지사항</h3>
        </div>
        {isDirector && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            수정
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="멘토들에게 전달할 공지사항을 작성하세요..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
              <X className="h-3.5 w-3.5 mr-1" />
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              저장
            </Button>
          </div>
        </div>
      ) : announcement ? (
        <div>
          <div className="rounded-md border bg-orange-50/50 dark:bg-orange-950/20 p-4">
            <MarkdownViewer source={announcement.content} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            최종 수정: {announcement.author.name} · {new Date(announcement.updatedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {isDirector ? (
            <button onClick={() => setEditing(true)} className="hover:text-foreground transition-colors">
              공지사항을 작성해주세요
            </button>
          ) : (
            "등록된 공지사항이 없습니다"
          )}
        </div>
      )}
    </div>
  );
}
