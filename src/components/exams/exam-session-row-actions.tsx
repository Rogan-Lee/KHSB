"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { deleteExamSession } from "@/actions/exam-sessions";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";

export function ExamSessionRowActions({ sessionId, title }: { sessionId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirmDialog();

  async function handleDelete() {
    const ok = await confirm({
      title: `"${title}" 세션을 삭제할까요?`,
      description: "좌석 배정과 입력된 성적이 모두 삭제되고, 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteExamSession(sessionId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-x1">
      <Button variant="ghost" size="icon" className="size-x9" asChild>
        <Link href={`/exams/${sessionId}/edit`} aria-label="세션 정보 수정" title="세션 정보 수정">
          <Pencil />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={pending}
        className="size-x9 text-fg-critical"
        aria-label="세션 삭제"
        title="세션 삭제"
      >
        <Trash2 />
      </Button>
      {confirmDialog}
    </div>
  );
}
