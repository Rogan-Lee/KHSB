"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Send } from "lucide-react";
import { ScheduleSlotsEditor, type AttendanceSlot, type OutingSlot } from "@/components/online/schedule-slots-editor";
import { submitScheduleProposal } from "@/actions/online/schedule-proposals";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "제출됨 (검토 대기)", cls: "bg-slate-100 text-slate-700" },
  PROPOSED: { label: "학부모 승인 대기", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "승인됨", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "반려됨", cls: "bg-rose-100 text-rose-700" },
  COMMITTED: { label: "일정 반영 완료", cls: "bg-emerald-100 text-emerald-800" },
  SUPERSEDED: { label: "대체됨", cls: "bg-gray-100 text-gray-500" },
  CANCELLED: { label: "취소됨", cls: "bg-gray-100 text-gray-500" },
};

type HistoryRow = { id: string; version: number; status: string; createdAt: string; committedAt: string | null };

export function ScheduleSubmitPanel({ token, history }: { token: string; history: HistoryRow[] }) {
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceSlot[]>([]);
  const [outings, setOutings] = useState<OutingSlot[]>([]);
  const [memo, setMemo] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (attendance.length === 0) {
      toast.error("등하원 요일을 1개 이상 선택해 주세요");
      return;
    }
    startTransition(async () => {
      try {
        await submitScheduleProposal({ studentToken: token, attendance, outings, memo });
        toast.success("스케줄을 제출했어요. 운영진 검토 후 학부모님께 안내됩니다.");
        setMemo("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "제출 실패");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-ink-3" />
        <h1 className="text-lg font-bold">등원 스케줄 제출</h1>
      </div>
      <p className="text-sm text-ink-3">
        다음 주 등하원 시간과 학원·외출 일정을 입력해 제출해 주세요. 운영진 확인 후 학부모님 승인을 거쳐 입퇴실 일정에 반영됩니다.
      </p>

      <div className="rounded-[14px] border border-line bg-panel p-4">
        <ScheduleSlotsEditor
          attendance={attendance}
          outings={outings}
          onAttendanceChange={setAttendance}
          onOutingsChange={setOutings}
        />
        <div className="mt-4 space-y-1.5">
          <label className="text-sm font-medium">메모 (선택)</label>
          <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="특이사항이 있으면 적어주세요" />
        </div>
        <Button className="mt-3 w-full gap-2" onClick={submit} disabled={pending}>
          <Send className="h-4 w-4" />{pending ? "제출 중…" : "제출하기"}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="rounded-[14px] border border-line bg-panel p-4">
          <p className="mb-2 text-sm font-medium">제출 이력</p>
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <span className="text-ink-4 tabular-nums">v{h.version}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_LABEL[h.status]?.cls ?? "bg-gray-100"}`}>
                  {STATUS_LABEL[h.status]?.label ?? h.status}
                </span>
                <span className="ml-auto text-[11px] text-ink-4 tabular-nums">
                  {new Date(h.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
