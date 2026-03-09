"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStudent, updateStudent } from "@/actions/students";
import { GRADE_OPTIONS } from "@/lib/utils";
import { toast } from "sonner";
import type { Student, User } from "@/generated/prisma";

interface StudentFormProps {
  student?: Student;
  mentors: Pick<User, "id" | "name">[];
}

export function StudentForm({ student, mentors }: StudentFormProps) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        if (student) {
          await updateStudent(student.id, formData);
        } else {
          await createStudent(formData);
        }
        toast.success(student ? "원생 정보가 수정되었습니다" : "원생이 등록되었습니다");
      } catch {
        toast.error("저장에 실패했습니다. 다시 시도해주세요.");
      }
    });
  }

  const defaultDate = student?.startDate
    ? new Date(student.startDate).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const defaultEndDate = student?.endDate
    ? new Date(student.endDate).toISOString().split("T")[0]
    : "";

  return (
    <form action={handleSubmit} ref={formRef} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">이름 *</Label>
          <Input id="name" name="name" defaultValue={student?.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grade">학년 *</Label>
          <Select name="grade" defaultValue={student?.grade}>
            <SelectTrigger>
              <SelectValue placeholder="학년 선택" />
            </SelectTrigger>
            <SelectContent>
              {GRADE_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">학생 연락처</Label>
          <Input id="phone" name="phone" defaultValue={student?.phone || ""} placeholder="010-0000-0000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="parentPhone">학부모 연락처 *</Label>
          <Input id="parentPhone" name="parentPhone" defaultValue={student?.parentPhone} required placeholder="010-0000-0000" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="school">학교</Label>
          <Input id="school" name="school" defaultValue={student?.school || ""} placeholder="○○고등학교" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seat">좌석번호</Label>
          <Input id="seat" name="seat" defaultValue={student?.seat || ""} placeholder="A-01" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mentorId">담당 멘토</Label>
        <Select name="mentorId" defaultValue={student?.mentorId || ""}>
          <SelectTrigger>
            <SelectValue placeholder="멘토 선택 (선택사항)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">미배정</SelectItem>
            {mentors.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">등원일 *</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">퇴원예정일</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={defaultEndDate} />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "저장 중..." : student ? "수정" : "등록"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
