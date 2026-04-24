"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { submitParentFeedback } from "@/actions/online/parent-reports";

export function ParentFeedbackForm({ token }: { token: string }) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("내용을 입력해 주세요");
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      try {
        await submitParentFeedback({
          token,
          name: name.trim() || null,
          content,
        });
        toast.success("의견이 전달되었습니다");
        setSubmitted(true);
        setContent("");
        setName("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전송 실패");
      } finally {
        setSubmitting(false);
      }
    });
  };

  if (submitted) {
    return (
      <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-[13px] font-semibold text-emerald-900">
          의견이 담당 원장님에게 전달되었습니다.
        </p>
        <p className="mt-1 text-[11.5px] text-emerald-800">
          추가로 남기실 내용이 있으면 아래 버튼으로 다시 작성할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-3 inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-1 text-[12px] font-medium text-emerald-800 hover:bg-emerald-100"
        >
          한 번 더 작성
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[12px] border border-line bg-panel p-4 space-y-3"
    >
      <div>
        <h3 className="text-[13px] font-semibold text-ink">
          원장님께 질문·의견 남기기
        </h3>
        <p className="mt-0.5 text-[11.5px] text-ink-4">
          원장님이 슬랙 알림을 받고 확인 후 개별 답변드립니다. 학생에게 직접 보이지 않습니다.
        </p>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="성함 (선택)"
        className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[12.5px]"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="질문·의견을 편하게 남겨 주세요 (2000자 이내)"
        maxLength={2000}
        className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[12.5px] resize-y"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-5 tabular-nums">
          {content.length}/2000
        </span>
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-ink text-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {submitting ? "전송 중..." : "의견 보내기"}
        </button>
      </div>
    </form>
  );
}
