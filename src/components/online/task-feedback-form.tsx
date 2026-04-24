"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createFeedback } from "@/actions/online/task-submissions";
import type { TaskFeedbackStatus } from "@/generated/prisma";

const STATUS_OPTIONS: { value: TaskFeedbackStatus; label: string; hint: string }[] = [
  { value: "COMMENT", label: "코멘트", hint: "단순 의견 — 상태 변화 없음" },
  { value: "NEEDS_REVISION", label: "수정 요청", hint: "학생이 다시 제출해야 함 → 상태: 수정 필요" },
  { value: "APPROVED", label: "최종 승인", hint: "수행평가 종료 → 상태: 최종 완료" },
];

export function TaskFeedbackForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<TaskFeedbackStatus>("COMMENT");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("피드백 내용을 입력하세요");
      return;
    }
    if (status === "APPROVED") {
      if (!confirm("최종 승인 시 수행평가가 '최종 완료' 상태로 전환됩니다. 계속하시겠어요?")) {
        return;
      }
    }
    startTransition(async () => {
      try {
        await createFeedback({ submissionId, content, status });
        toast.success("피드백이 작성되었습니다");
        setContent("");
        setStatus("COMMENT");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "작성 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-[12px] border border-line bg-panel p-4">
      <h3 className="text-[13px] font-semibold text-ink">피드백 작성</h3>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="제출 내용에 대한 피드백을 작성하세요"
        className="w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink resize-y focus:outline-none focus:border-line-strong"
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-[8px] border px-3 py-2 text-[12px] flex-1 min-w-[140px] ${
              status === opt.value
                ? "border-ink bg-canvas-2"
                : "border-line bg-panel hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="status"
              value={opt.value}
              checked={status === opt.value}
              onChange={(e) => setStatus(e.target.value as TaskFeedbackStatus)}
              className="sr-only"
            />
            <div className="font-semibold text-ink">{opt.label}</div>
            <div className="text-[11px] text-ink-4 mt-0.5">{opt.hint}</div>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="rounded-[8px] bg-ink text-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending ? "작성 중..." : "피드백 등록"}
        </button>
      </div>
    </form>
  );
}
