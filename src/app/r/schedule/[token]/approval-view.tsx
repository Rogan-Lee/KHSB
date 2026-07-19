"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, CalendarClock } from "lucide-react";
import { approveScheduleProposal, rejectScheduleProposal } from "@/actions/online/schedule-proposals";
import type { AttendanceSlot, OutingSlot } from "@/components/online/schedule-slots-editor";

const DAY_LABEL: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ScheduleApprovalView({
  token,
  studentName,
  studentGrade,
  status,
  attendance,
  outings,
  adminNote,
  scheduledFor,
}: {
  token: string;
  studentName: string;
  studentGrade: string;
  status: string;
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  adminNote: string | null;
  scheduledFor: string | null;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const applied = status === "APPROVED" || status === "COMMITTED"; // 반영됨 — 피드백만 가능
  const att = [...attendance].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));

  function approve() {
    startTransition(async () => {
      try {
        await approveScheduleProposal(token);
        toast.success("승인했습니다. 감사합니다!");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "승인 실패");
      }
    });
  }
  function reject() {
    if (!feedback.trim()) return toast.error("의견을 입력해 주세요");
    startTransition(async () => {
      try {
        await rejectScheduleProposal(token, feedback);
        toast.success("의견을 전달했습니다.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "전송 실패");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-ink-3" />
        <h1 className="text-lg font-bold">등원 스케줄 확인</h1>
      </div>
      <p className="text-sm text-ink-3">
        {studentName} ({studentGrade}) 학생의 등원 스케줄(안)입니다. 확인 후 승인해 주세요.
      </p>

      {scheduledFor && (
        <div className="flex items-center gap-2 rounded-[14px] border border-line bg-canvas-2 px-4 py-3 text-sm">
          <CalendarClock className="h-4 w-4 shrink-0 text-ink-3" />
          <span>
            승인 시 <b>{new Date(scheduledFor).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</b>부터 이 스케줄이 적용됩니다.
          </span>
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-panel p-4 space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">주간 등하원</p>
          {att.length === 0 ? (
            <p className="text-sm text-ink-4">등원 일정이 없습니다</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {att.map((a) => (
                <li key={a.dayOfWeek} className="flex items-center gap-2">
                  <span className="w-6 font-medium">{DAY_LABEL[a.dayOfWeek]}</span>
                  <span className="tabular-nums">{a.startTime} ~ {a.endTime}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {outings.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">학원·외출</p>
            <ul className="space-y-1 text-sm">
              {outings.map((o, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 font-medium">{DAY_LABEL[o.dayOfWeek]}</span>
                  <span className="tabular-nums">{o.outStart} ~ {o.outEnd}</span>
                  {o.reason && <span className="text-ink-3">({o.reason})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {adminNote && (
          <p className="rounded-lg bg-canvas-2 px-3 py-2 text-[13px] text-ink-2">{adminNote}</p>
        )}
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="수정이 필요한 부분을 알려주세요" />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setRejecting(false)} disabled={pending}>취소</Button>
            <Button variant="destructive" className="flex-1" onClick={reject} disabled={pending}>{pending ? "전송 중…" : "의견 전달"}</Button>
          </div>
        </div>
      ) : status === "PROPOSED" ? (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setRejecting(true)} disabled={pending}>수정 요청</Button>
          <Button className="flex-1 gap-1.5" onClick={approve} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" />{pending ? "처리 중…" : "승인"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-[14px] border border-line bg-panel p-4 text-center text-sm">
            {applied ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />이 스케줄이 반영되었습니다
              </span>
            ) : status === "REJECTED" ? (
              <span className="text-rose-600">의견을 전달했습니다. 운영진이 다시 안내드릴 예정입니다.</span>
            ) : (
              <span className="text-ink-4">처리되었습니다</span>
            )}
          </div>
          {applied && (
            <Button variant="outline" className="w-full" onClick={() => setRejecting(true)} disabled={pending}>수정 요청</Button>
          )}
        </div>
      )}
    </div>
  );
}
