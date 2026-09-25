"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enableOnlineManagement } from "@/actions/online/students";
import { Users } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { EmptyState, FormActions, FormField } from "@/components/backoffice/ui";

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
      <EmptyState
        compact
        icon={Users}
        title="전환할 수 있는 오프라인 학생이 없어요"
        description="재원 중인 오프라인 학생만 온라인 관리로 전환할 수 있어요"
      />
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
    <form onSubmit={onSubmit} className="flex flex-col gap-x5">
      <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
        <FormField label="학생" required>
          <Combobox
            value={studentId}
            onChange={setStudentId}
            items={offlineStudents.map((s) => ({ value: s.id, label: s.name, subLabel: s.grade }))}
            placeholder="학생 선택…"
            searchPlaceholder="이름/학년 검색…"
            triggerClassName="t4-regular"
            popoverClassName="w-[--radix-popover-trigger-width] min-w-[240px]"
          />
        </FormField>

        <FormField label="관리 멘토">
          <Combobox
            value={assignedMentorId}
            onChange={setAssignedMentorId}
            items={mentors.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="나중에 배정"
            searchPlaceholder="이름 검색…"
            allowEmpty
            emptyLabel="나중에 배정"
            triggerClassName="t4-regular"
            popoverClassName="w-[--radix-popover-trigger-width] min-w-[200px]"
          />
        </FormField>

        <FormField label="컨설턴트">
          <Combobox
            value={assignedConsultantId}
            onChange={setAssignedConsultantId}
            items={consultants.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="나중에 배정"
            searchPlaceholder="이름 검색…"
            allowEmpty
            emptyLabel="나중에 배정"
            triggerClassName="t4-regular"
            popoverClassName="w-[--radix-popover-trigger-width] min-w-[200px]"
          />
        </FormField>
      </div>

      <FormActions>
        <Button type="submit" disabled={isPending || !studentId} className="w-full sm:w-auto">
          {isPending ? "전환 중…" : "온라인 관리로 전환"}
        </Button>
      </FormActions>
    </form>
  );
}
