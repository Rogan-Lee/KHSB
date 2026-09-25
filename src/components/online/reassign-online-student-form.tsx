"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reassignOnlineStudent, disableOnlineManagement } from "@/actions/online/students";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";

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
  const [disableOpen, setDisableOpen] = useState(false);

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
    setDisableOpen(false);
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

  const fields: { key: string; label: string; value: string; onChange: (v: string) => void; items: UserOption[] }[] = [
    { key: "mentor", label: "관리 멘토", value: mentorId, onChange: setMentorId, items: mentors },
    { key: "consultant", label: "컨설턴트", value: consultantId, onChange: setConsultantId, items: consultants },
    { key: "staff", label: "운영조교", value: staffId, onChange: setStaffId, items: staffs },
  ];

  return (
    <>
      <form onSubmit={onSave} className="flex flex-col gap-x4">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
          {fields.map((f) => (
            <FormField key={f.key} label={f.label}>
              <Combobox
                value={f.value}
                onChange={f.onChange}
                items={f.items.map((u) => ({ value: u.id, label: u.name }))}
                placeholder="미배정"
                searchPlaceholder="이름 검색…"
                allowEmpty
                emptyLabel="미배정"
                triggerClassName="t4-regular"
                popoverClassName="w-[--radix-popover-trigger-width]"
              />
            </FormField>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-fg-critical"
            onClick={() => setDisableOpen(true)}
            disabled={isPending}
          >
            온라인 관리 해제
          </Button>
          <Button type="submit" disabled={!changed || isPending}>
            {isPending ? "저장 중…" : "담당자 저장"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title={`${studentName} 학생을 온라인 관리에서 해제할까요?`}
        description="활성 매직링크가 모두 무효화되고, 온라인 학생 목록에서 빠져요."
        confirmLabel="해제"
        destructive
        pending={isPending}
        onConfirm={onDisable}
      />
    </>
  );
}
