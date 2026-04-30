"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reassignOnlineStudent, disableOnlineManagement } from "@/actions/online/students";

type UserOption = { id: string; name: string };

export function ReassignOnlineStudentForm({
  studentId,
  studentName,
  currentMentorId,
  currentConsultantId,
  currentStaffId,
  mentors,
  consultants,
  staffs,
}: {
  studentId: string;
  studentName: string;
  currentMentorId: string | null;
  currentConsultantId: string | null;
  currentStaffId: string | null;
  mentors: UserOption[];
  consultants: UserOption[];
  staffs: UserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mentorId, setMentorId] = useState(currentMentorId ?? "");
  const [consultantId, setConsultantId] = useState(currentConsultantId ?? "");
  const [staffId, setStaffId] = useState(currentStaffId ?? "");

  const changed =
    mentorId !== (currentMentorId ?? "") ||
    consultantId !== (currentConsultantId ?? "") ||
    staffId !== (currentStaffId ?? "");

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await reassignOnlineStudent({
          studentId,
          assignedMentorId: mentorId || null,
          assignedConsultantId: consultantId || null,
          assignedStaffId: staffId || null,
        });
        toast.success("담당자가 변경되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "변경 실패");
      }
    });
  };

  const onDisable = () => {
    if (!confirm(`${studentName} 학생을 온라인 관리에서 해제합니다.\n활성 매직링크가 모두 무효화됩니다. 계속하시겠어요?`)) {
      return;
    }
    startTransition(async () => {
      try {
        await disableOnlineManagement(studentId);
        toast.success("온라인 관리가 해제되었습니다");
        router.push("/online/students");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "해제 실패");
      }
    });
  };

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-4">관리 멘토</span>
          <select
            value={mentorId}
            onChange={(e) => setMentorId(e.target.value)}
            className="rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">미배정</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-4">컨설턴트</span>
          <select
            value={consultantId}
            onChange={(e) => setConsultantId(e.target.value)}
            className="rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">미배정</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-4">운영조교</span>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">미배정</option>
            {staffs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={!changed || isPending}
          className="rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "담당자 저장"}
        </button>
        <button
          type="button"
          onClick={onDisable}
          disabled={isPending}
          className="text-[12px] text-red-600 hover:underline disabled:opacity-50"
        >
          온라인 관리 해제
        </button>
      </div>
    </form>
  );
}
