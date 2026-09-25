"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOnlineStudent } from "@/actions/online/students";
import { Combobox } from "@/components/ui/combobox";
import { FormActions, FormField } from "@/components/backoffice/ui";

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
    <form onSubmit={onSubmit} className="flex flex-col gap-x6">
      <FieldGroup title="학생">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
          <FormField label="이름" required htmlFor="nos-name">
            <Input id="nos-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김지훈" />
          </FormField>
          <FormField label="학년" required htmlFor="nos-grade">
            <Input
              id="nos-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="예: 고3, N수, 중3"
            />
          </FormField>
          <FormField label="학교" htmlFor="nos-school">
            <Input
              id="nos-school"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="학교명 (선택)"
            />
          </FormField>
        </div>
      </FieldGroup>

      <FieldGroup title="학부모 · 시작일">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
          <FormField label="학부모 연락처" required htmlFor="nos-phone">
            <Input
              id="nos-phone"
              inputMode="tel"
              className="tabular-nums"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="010-1234-5678"
            />
          </FormField>
          <FormField label="학부모 이메일" htmlFor="nos-email">
            <Input
              id="nos-email"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="parent@example.com (선택)"
            />
          </FormField>
          <FormField label="온라인 관리 시작일" required htmlFor="nos-start">
            <Input
              id="nos-start"
              type="date"
              className="tabular-nums"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>
        </div>
      </FieldGroup>

      <FieldGroup title="입시 정보">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
          <FormField label="목표 대학" htmlFor="nos-univ">
            <Input
              id="nos-univ"
              value={targetUniversity}
              onChange={(e) => setTargetUniversity(e.target.value)}
              placeholder="예: 서울대 경영학과"
            />
          </FormField>
          <FormField label="선택 과목" htmlFor="nos-subjects">
            <Input
              id="nos-subjects"
              value={selectedSubjects}
              onChange={(e) => setSelectedSubjects(e.target.value)}
              placeholder="예: 수학, 영어, 사탐"
            />
          </FormField>
          <FormField label="지원 전형" htmlFor="nos-admission">
            <Input
              id="nos-admission"
              value={admissionType}
              onChange={(e) => setAdmissionType(e.target.value)}
              placeholder="예: 수시 학종, 정시"
            />
          </FormField>
        </div>
      </FieldGroup>

      <FieldGroup title="담당자" hint="비워 두면 나중에 학생 화면에서 배정할 수 있어요">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-2">
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
              popoverClassName="w-[--radix-popover-trigger-width]"
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
              popoverClassName="w-[--radix-popover-trigger-width]"
            />
          </FormField>
        </div>
      </FieldGroup>

      <FormActions>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {isPending ? "등록 중…" : "온라인 학생 등록"}
        </Button>
      </FormActions>
    </form>
  );
}

function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-x3 t5-bold text-fg-neutral">
        {title}
        {hint && <span className="ml-x2 t3-regular text-fg-neutral-subtle">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}
