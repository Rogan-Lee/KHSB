"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, CheckCircle2, Clock } from "lucide-react";
import { submitExamApplication, cancelExamApplication } from "@/actions/exam-application";
import type { ExamApplicationSession } from "@/lib/exam-application-data";

function dateLabel(ymd: string): string {
  return new Date(ymd + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function ExamApplicationForm({
  token,
  sessions,
}: {
  token: string;
  sessions: ExamApplicationSession[];
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-[18px] bg-gradient-to-br from-brand to-brand-2 p-5 text-white shadow-md">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" strokeWidth={2.4} />
          <h2 className="text-[18px] font-bold tracking-[-0.02em]">모의고사 신청</h2>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed opacity-95">
          응시할 모의고사를 골라 신청해 주세요. 운영진 확인 후 최종 확정됩니다.
        </p>
      </section>

      {sessions.length === 0 ? (
        <section className="rounded-[14px] border border-line bg-panel p-6 text-center text-[13px] text-ink-4">
          현재 신청 접수 중인 모의고사가 없습니다.
        </section>
      ) : (
        sessions.map((s) => <SessionCard key={s.sessionId} token={token} session={s} />)
      )}
    </div>
  );
}

function SessionCard({ token, session }: { token: string; session: ExamApplicationSession }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [memo, setMemo] = useState(session.myMemo);
  const applied = session.myStatus === "PENDING" || session.myStatus === "CONFIRMED";
  const confirmed = session.myStatus === "CONFIRMED";

  function apply() {
    startTransition(async () => {
      try {
        await submitExamApplication(token, session.sessionId, memo);
        toast.success("신청이 접수되었어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }
  function cancel() {
    startTransition(async () => {
      try {
        await cancelExamApplication(token, session.sessionId);
        toast.success("신청을 취소했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "취소에 실패했어요");
      }
    });
  }

  return (
    <section className="rounded-[14px] border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">{session.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-4">
            {dateLabel(session.examDate)} · {session.examTypeLabel}
          </p>
        </div>
        {confirmed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok-ink">
            <CheckCircle2 className="h-3.5 w-3.5" /> 확정
          </span>
        ) : applied ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn-ink">
            <Clock className="h-3.5 w-3.5" /> 신청 접수됨
          </span>
        ) : null}
      </div>

      {session.subjects.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-3">과목: {session.subjects.join(", ")}</p>
      )}
      {session.notes && (
        <p className="mt-1 whitespace-pre-wrap text-[12px] text-ink-4">{session.notes}</p>
      )}

      {confirmed ? (
        <p className="mt-3 rounded-[10px] bg-ok-soft/50 px-3 py-2.5 text-[12.5px] text-ink-2">
          응시가 확정되었습니다. 변경이 필요하면 운영진에게 문의해 주세요.
        </p>
      ) : (
        <>
          {!applied && (
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="요청사항 (선택)"
              rows={2}
              maxLength={300}
              className="mt-3 w-full resize-none rounded-[12px] border border-line bg-panel px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none"
            />
          )}
          <div className="mt-3 flex gap-2">
            {applied ? (
              <button
                onClick={cancel}
                disabled={busy}
                className="flex-1 rounded-[12px] border border-line bg-panel px-4 py-3 text-[14px] font-semibold text-ink-3 active:bg-canvas-2 disabled:opacity-50"
              >
                {busy ? "처리 중…" : "신청 취소"}
              </button>
            ) : (
              <button
                onClick={apply}
                disabled={busy}
                className="flex-1 rounded-[12px] bg-brand px-4 py-3 text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "처리 중…" : "신청하기"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
