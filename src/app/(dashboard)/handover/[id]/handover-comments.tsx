"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addHandoverComment, deleteHandoverComment } from "@/actions/handover";
import { Avatar, EmptyState, Section } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    startTransition(async () => {
      try {
        await deleteHandoverComment(id);
        setDeleteId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <Section title="댓글" count={comments.length > 0 ? comments.length : undefined} flush>
      {comments.length === 0 ? (
        <EmptyState
          compact
          icon={MessageSquare}
          title="아직 댓글이 없어요"
          description="궁금한 점이나 처리 결과를 남겨 보세요"
          className="border-t border-stroke-neutral-muted"
        />
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
          {comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-x3 px-x5 py-x4">
              <Avatar name={c.authorName || "직원"} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-x2">
                  <span className="t4-bold text-fg-neutral">{c.authorName || "직원"}</span>
                  <span className="t3-regular tabular-nums text-fg-neutral-subtle">{fmt(c.createdAt)}</span>
                  {(canModerate || c.authorId === currentUserId) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(c.id)}
                      disabled={pending}
                      aria-label="댓글 삭제"
                      title="삭제"
                      className="ml-auto size-8 hover:text-fg-critical sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <p className="mt-x0_5 whitespace-pre-wrap t4-regular text-fg-neutral-muted">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-x2 border-t border-stroke-neutral-muted px-x5 py-x4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="댓글을 입력하세요…"
          aria-label="댓글 입력"
          rows={2}
          className="resize-y"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
        />
        <div className="flex items-center justify-between gap-x2">
          <span className="hidden t3-regular text-fg-neutral-subtle sm:inline">⌘/Ctrl + Enter로 바로 등록돼요</span>
          <Button onClick={submit} disabled={pending || !text.trim()} className="ml-auto">
            {pending ? "등록 중…" : "등록"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="댓글을 삭제할까요?"
        description="삭제하면 되돌릴 수 없어요."
        pendingLabel="삭제하는 중…"
        pending={pending}
        onConfirm={() => { if (deleteId) remove(deleteId); }}
      />
    </Section>
  );
}
