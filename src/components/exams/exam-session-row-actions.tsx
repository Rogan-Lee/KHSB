"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { deleteExamSession } from "@/actions/exam-sessions";

export function ExamSessionRowActions({ sessionId, title }: { sessionId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`시험 세션 "${title}"을(를) 삭제하시겠습니까?\n좌석 배정과 입력된 성적이 모두 삭제됩니다.`)) return;
    startTransition(async () => {
      await deleteExamSession(sessionId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/exams/${sessionId}/edit`}>
        <Button variant="ghost" size="sm" title="세션 정보 수정">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={pending}
        className="text-destructive hover:text-destructive"
        title="세션 삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
