"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enableOnlineManagement } from "@/actions/online/students";

type StudentOption = { id: string; name: string; grade: string };
type UserOption = { id: string; name: string };

export function EnableOnlineStudentForm({
  offlineStudents,
  mentors,
  consultants,
}: {
  offlineStudents: StudentOption[];
  mentors: UserOption[];
  consultants: UserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState("");
  const [assignedMentorId, setAssignedMentorId] = useState("");
  const [assignedConsultantId, setAssignedConsultantId] = useState("");

  if (offlineStudents.length === 0) {
    return (
      <p className="text-[12px] text-ink-5">
        전환 가능한 오프라인 학생이 없습니다.
      </p>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      toast.error("학생을 선택하세요");
      return;
    }
    startTransition(async () => {
      try {
        await enableOnlineManagement({
          studentId,
          assignedMentorId: assignedMentorId || null,
          assignedConsultantId: assignedConsultantId || null,
        });
        toast.success("온라인 관리로 전환되었습니다");
        setStudentId("");
        setAssignedMentorId("");
        setAssignedConsultantId("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전환 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-4">학생</span>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="min-w-[160px] rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="">선택...</option>
          {offlineStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.grade})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-4">관리 멘토</span>
        <select
          value={assignedMentorId}
          onChange={(e) => setAssignedMentorId(e.target.value)}
          className="min-w-[140px] rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="">나중에 배정</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-4">컨설턴트</span>
        <select
          value={assignedConsultantId}
          onChange={(e) => setAssignedConsultantId(e.target.value)}
          className="min-w-[140px] rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="">나중에 배정</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={isPending || !studentId}
        className="rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
      >
        {isPending ? "전환 중..." : "온라인 관리로 전환"}
      </button>
    </form>
  );
}
