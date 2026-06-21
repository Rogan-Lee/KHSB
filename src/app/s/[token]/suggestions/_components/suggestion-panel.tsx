"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Megaphone, X, MessageSquareReply } from "lucide-react";
import {
  createStudentSuggestion,
  markStudentSuggestionsRead,
  type SuggestionView,
} from "@/actions/student-suggestions";
import { CATEGORY_LABELS, CATEGORY_ORDER, STATUS_LABELS, STATUS_BADGE } from "@/lib/suggestions";
import type { SuggestionCategory } from "@/generated/prisma/enums";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function SuggestionPanel({ token, initial }: { token: string; initial: SuggestionView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SuggestionCategory>("FACILITY");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  // 진입 시 미확인 배지 클리어
  useEffect(() => {
    markStudentSuggestionsRead({ studentToken: token }).catch(() => {});
  }, [token]);

  function submit() {
    if (!title.trim()) return toast.error("제목을 입력해 주세요");
    if (!content.trim()) return toast.error("건의 내용을 입력해 주세요");
    startTransition(async () => {
      try {
        await createStudentSuggestion({ studentToken: token, category, title, content });
        toast.success("건의사항이 접수되었어요");
        setTitle("");
        setContent("");
        setCategory("FACILITY");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "제출 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">건의사항</h1>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.8} /> 건의하기
          </button>
        )}
      </div>

      {/* 작성 폼 */}
      {open && (
        <div className="rounded-[14px] border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[14px] font-semibold text-ink">새 건의 작성</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-ink-4 hover:bg-canvas-2">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <label className="mb-1 block text-[12px] font-medium text-ink-3">분류</label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1.5 text-[13px] ${
                  category === c
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-panel text-ink-3 hover:bg-canvas-2"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-[12px] font-medium text-ink-3">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 3층 정수기 온수가 안 나와요"
            maxLength={120}
            className="mb-3 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[16px] focus:border-brand focus:outline-none"
          />

          <label className="mb-1 block text-[12px] font-medium text-ink-3">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="건의 내용을 자세히 적어주세요"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[16px] focus:border-brand focus:outline-none"
          />

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-[15px] font-semibold text-white disabled:opacity-50"
          >
            건의 제출
          </button>
        </div>
      )}

      {/* 목록 */}
      {initial.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
            <Megaphone className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-2">아직 건의사항이 없어요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
            불편한 점이나 바라는 점을 알려주세요.
            <br />
            검토 후 결과를 여기서 안내해 드려요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {initial.map((s) => (
            <li key={s.id} className={`rounded-[14px] border border-line bg-panel p-4 ${s.deletedAt ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
                  {CATEGORY_LABELS[s.category]}
                </span>
                {s.deletedAt ? (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-600">
                    삭제됨
                  </span>
                ) : (
                  <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${STATUS_BADGE[s.status]}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                )}
                {s.hasUnseenUpdate && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                    업데이트
                  </span>
                )}
              </div>
              {s.deletedAt && (
                <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
                  이 건의사항은 관리자에 의해 삭제되었습니다.
                </p>
              )}
              <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{s.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-3">{s.content}</p>

              {s.staffReply && (
                <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3">
                  <p className="flex items-center gap-1 text-[11.5px] font-semibold text-brand">
                    <MessageSquareReply className="h-3.5 w-3.5" />
                    원장 답변{s.handledByName ? ` · ${s.handledByName}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{s.staffReply}</p>
                </div>
              )}

              <div className="mt-2.5 border-t border-line pt-2.5 text-[11.5px] tabular-nums text-ink-4">
                {fmtDate(s.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
