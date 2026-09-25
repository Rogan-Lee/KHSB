"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/backoffice/ui";
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
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-x5">
          <DialogHeader>
            <DialogTitle>온라인 학생 정보 수정</DialogTitle>
            <DialogDescription>{row.studentName} 학생의 기본 정보를 고쳐요</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
            <FormField label="이름" required htmlFor="ose-name">
              <Input id="ose-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="학년" required htmlFor="ose-grade">
              <Input id="ose-grade" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </FormField>
            <FormField label="학교" htmlFor="ose-school">
              <Input id="ose-school" value={school} onChange={(e) => setSchool(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-x4 md:grid-cols-2">
            <FormField label="학부모 연락처" required htmlFor="ose-phone">
              <Input
                id="ose-phone"
                inputMode="tel"
                className="tabular-nums"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
              />
            </FormField>
            <FormField label="학부모 이메일" htmlFor="ose-email">
              <Input id="ose-email" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-x4 md:grid-cols-3">
            <FormField label="목표 대학" htmlFor="ose-univ">
              <Input id="ose-univ" value={targetUniversity} onChange={(e) => setTargetUniversity(e.target.value)} />
            </FormField>
            <FormField label="선택 과목" htmlFor="ose-subjects">
              <Input id="ose-subjects" value={selectedSubjects} onChange={(e) => setSelectedSubjects(e.target.value)} />
            </FormField>
            <FormField label="지원 전형" htmlFor="ose-admission">
              <Input id="ose-admission" value={admissionType} onChange={(e) => setAdmissionType(e.target.value)} />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  저장 중…
                </>
              ) : (
                "저장"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
