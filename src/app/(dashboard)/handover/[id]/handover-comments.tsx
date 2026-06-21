"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addHandoverComment, deleteHandoverComment } from "@/actions/handover";

type Comment = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: Date;
};

function fmt(d: Date) {
  return new Date(d).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  });
}

export function HandoverComments({
  handoverId,
  comments,
  currentUserId,
  canModerate,
}: {
  handoverId: string;
  comments: Comment[];
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const content = text.trim();
    if (!content) return;
    startTransition(async () => {
      try {
        await addHandoverComment(handoverId, content);
        setText("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "댓글 작성 실패");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("댓글을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await deleteHandoverComment(id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        댓글 {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
      </div>

      <ul className="space-y-2.5 mb-3">
        {comments.length === 0 ? (
          <li className="text-sm text-muted-foreground py-2">아직 댓글이 없습니다.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-2 text-sm">
              <div className="flex-1 rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13px]">{c.authorName || "직원"}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(c.createdAt)}</span>
                  {(canModerate || c.authorId === currentUserId) && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={pending}
                      className="ml-auto p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/90">{c.content}</p>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="댓글을 입력하세요…"
          rows={2}
          className="flex-1 text-sm resize-y"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
        />
        <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "등록"}
        </Button>
      </div>
    </div>
  );
}
