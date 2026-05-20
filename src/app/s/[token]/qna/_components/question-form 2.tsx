"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createStudentQuestion, type QuestionAttachment } from "@/actions/student-questions";
import { PhotoUploader } from "@/components/questions/photo-uploader";

const SUBJECTS = ["수학", "영어", "국어", "과학탐구", "사회탐구", "한국사", "기타"];

export function QuestionForm({ token }: { token: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<QuestionAttachment[]>([]);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    title.trim().length > 0 && (content.trim().length > 0 || attachments.length > 0) && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const { id } = await createStudentQuestion({
          studentToken: token,
          title: title.trim(),
          subject: subject || null,
          content: content.trim(),
          attachments,
        });
        toast.success("질문을 등록했어요");
        router.replace(`/s/${token}/qna/${id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "등록에 실패했어요");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="예) 미적분 28번 모르겠어요"
          className="w-full rounded-[12px] border border-line bg-canvas-2 px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
          과목 <span className="font-normal text-ink-4">(선택)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECTS.map((s) => {
            const active = subject === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSubject(active ? "" : s)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? "bg-brand text-white"
                    : "border border-line bg-panel text-ink-3 active:bg-canvas-2"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
          문제 사진 <span className="font-normal text-ink-4">(카메라 촬영 또는 갤러리)</span>
        </label>
        <PhotoUploader
          attachments={attachments}
          onChange={setAttachments}
          studentToken={token}
          disabled={isPending}
          label="사진 추가"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
          내용 <span className="font-normal text-ink-4">(어디까지 풀었는지 / 막힌 부분)</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="여기까지는 풀었는데 이 부분이 이해가 안 돼요..."
          className="w-full resize-none rounded-[12px] border border-line bg-canvas-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink placeholder:text-ink-5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-brand px-4 py-3 text-[14.5px] font-semibold text-white active:scale-[0.99] disabled:bg-ink-5 disabled:active:scale-100 transition-transform"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        질문 등록하기
      </button>
      <p className="text-center text-[11.5px] text-ink-4">
        등록하면 당일 근무 멘토가 확인하고 풀이를 답해드려요.
      </p>
    </div>
  );
}
