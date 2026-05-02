"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOnlineStudent } from "@/actions/online/students";
import { Combobox } from "@/components/ui/combobox";

type UserOption = { id: string; name: string };

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function NewOnlineStudentForm({
  mentors,
  consultants,
}: {
  mentors: UserOption[];
  consultants: UserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [targetUniversity, setTargetUniversity] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState("");
  const [admissionType, setAdmissionType] = useState("");
  const [assignedMentorId, setAssignedMentorId] = useState("");
  const [assignedConsultantId, setAssignedConsultantId] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("학생 이름 필수");
    if (!grade.trim()) return toast.error("학년 필수");
    if (!parentPhone.trim()) return toast.error("학부모 연락처 필수");

    startTransition(async () => {
      try {
        const result = await createOnlineStudent({
          name,
          grade,
          parentPhone,
          startDate,
          school: school || null,
          parentEmail: parentEmail || null,
          targetUniversity: targetUniversity || null,
          selectedSubjects: selectedSubjects || null,
          admissionType: admissionType || null,
          assignedMentorId: assignedMentorId || null,
          assignedConsultantId: assignedConsultantId || null,
        });
        toast.success("온라인 학생이 등록되었습니다");
        router.push(`/online/students/${result.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "등록 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="이름" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 김지훈"
            className="text-[13px]"
          />
        </Field>
        <Field label="학년" required>
          <Input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="예: 고3, N수, 중3"
            className="text-[13px]"
          />
        </Field>
        <Field label="학교">
          <Input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="학교명 (선택)"
            className="text-[13px]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="학부모 연락처" required>
          <Input
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            placeholder="010-1234-5678"
            className="text-[13px]"
          />
        </Field>
        <Field label="학부모 이메일">
          <Input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="parent@example.com (선택)"
            className="text-[13px]"
          />
        </Field>
        <Field label="온라인 관리 시작일" required>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-[13px]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="목표 대학">
          <Input
            value={targetUniversity}
            onChange={(e) => setTargetUniversity(e.target.value)}
            placeholder="예: 서울대 경영학과"
            className="text-[13px]"
          />
        </Field>
        <Field label="선택 과목">
          <Input
            value={selectedSubjects}
            onChange={(e) => setSelectedSubjects(e.target.value)}
            placeholder="예: 수학, 영어, 사탐"
            className="text-[13px]"
          />
        </Field>
        <Field label="지원 전형">
          <Input
            value={admissionType}
            onChange={(e) => setAdmissionType(e.target.value)}
            placeholder="예: 수시 학종, 정시"
            className="text-[13px]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="관리 멘토">
          <Combobox
            value={assignedMentorId}
            onChange={setAssignedMentorId}
            items={mentors.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="나중에 배정"
            searchPlaceholder="이름 검색…"
            allowEmpty
            emptyLabel="나중에 배정"
            triggerClassName="text-[13px]"
            popoverClassName="w-[--radix-popover-trigger-width]"
          />
        </Field>
        <Field label="컨설턴트">
          <Combobox
            value={assignedConsultantId}
            onChange={setAssignedConsultantId}
            items={consultants.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="나중에 배정"
            searchPlaceholder="이름 검색…"
            allowEmpty
            emptyLabel="나중에 배정"
            triggerClassName="text-[13px]"
            popoverClassName="w-[--radix-popover-trigger-width]"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4 mr-1.5" />
          )}
          온라인 학생 등록
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-4">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
