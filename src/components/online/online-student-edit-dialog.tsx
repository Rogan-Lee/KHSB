"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOnlineStudent } from "@/actions/online/students";
import type { OnlineStudentPanelRow } from "./online-students-panel";

export function OnlineStudentEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: OnlineStudentPanelRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(row.studentName);
  const [grade, setGrade] = useState(row.grade);
  const [school, setSchool] = useState(row.school ?? "");
  const [parentPhone, setParentPhone] = useState(row.parentPhone);
  const [parentEmail, setParentEmail] = useState(row.parentEmail ?? "");
  const [targetUniversity, setTargetUniversity] = useState(row.targetUniversity ?? "");
  const [selectedSubjects, setSelectedSubjects] = useState(row.selectedSubjects ?? "");
  const [admissionType, setAdmissionType] = useState(row.admissionType ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("이름은 필수입니다");
    if (!grade.trim()) return toast.error("학년은 필수입니다");
    if (!parentPhone.trim()) return toast.error("학부모 연락처는 필수입니다");
    startTransition(async () => {
      try {
        await updateOnlineStudent({
          studentId: row.studentId,
          name,
          grade,
          school: school || null,
          parentPhone,
          parentEmail: parentEmail || null,
          targetUniversity: targetUniversity || null,
          selectedSubjects: selectedSubjects || null,
          admissionType: admissionType || null,
        });
        toast.success("저장되었습니다");
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !pending && onClose()}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-background rounded-lg shadow-lg w-full max-w-lg p-5 space-y-3"
      >
        <h3 className="font-semibold text-sm">온라인 학생 정보 수정</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Field label="이름" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="text-[13px]" />
          </Field>
          <Field label="학년" required>
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} className="text-[13px]" />
          </Field>
          <Field label="학교">
            <Input value={school} onChange={(e) => setSchool(e.target.value)} className="text-[13px]" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Field label="학부모 연락처" required>
            <Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="text-[13px]" />
          </Field>
          <Field label="학부모 이메일">
            <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} className="text-[13px]" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Field label="목표 대학">
            <Input value={targetUniversity} onChange={(e) => setTargetUniversity(e.target.value)} className="text-[13px]" />
          </Field>
          <Field label="선택 과목">
            <Input value={selectedSubjects} onChange={(e) => setSelectedSubjects(e.target.value)} className="text-[13px]" />
          </Field>
          <Field label="지원 전형">
            <Input value={admissionType} onChange={(e) => setAdmissionType(e.target.value)} className="text-[13px]" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />저장 중…</> : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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
