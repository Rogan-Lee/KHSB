"use client";

import { useRef, useTransition, useState } from "react";
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
import { GRADE_OPTIONS, parseSchool } from "@/lib/utils";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";
import type { Student, User } from "@/generated/prisma";

const TOTAL_SEATS = 89;

interface StudentFormProps {
  student?: Student;
  mentors: Pick<User, "id" | "name">[];
  schools?: string[];
  occupiedSeats?: string[];
}

function SchoolCombobox({ name, defaultValue, options }: { name: string; defaultValue?: string; options: string[] }) {
  const clean = parseSchool(defaultValue ?? "");
  const [value, setValue] = useState(clean);
  const [query, setQuery] = useState(clean);
  const [open, setOpen] = useState(false);

  const filtered = query
    ? options.filter((s) => s.includes(query)).slice(0, 12)
    : options.slice(0, 12);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="학교명 검색 또는 직접 입력"
          autoComplete="off"
          className="pr-8"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={() => { setValue(s); setQuery(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StudentForm({ student, mentors, schools = [], occupiedSeats = [] }: StudentFormProps) {
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
      } catch (e) {
        // redirect()는 내부적으로 에러를 throw하므로 re-throw
        if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
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

      <div className="space-y-2">
        <Label htmlFor="parentEmail">학부모 이메일</Label>
        <Input id="parentEmail" name="parentEmail" type="email" defaultValue={student?.parentEmail || ""} placeholder="parent@example.com" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="school">학교</Label>
          <SchoolCombobox name="school" defaultValue={student?.school || ""} options={schools} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="classGroup">반</Label>
          <Select name="classGroup" defaultValue={student?.classGroup || "none"}>
            <SelectTrigger>
              <SelectValue placeholder="반 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">미배정</SelectItem>
              <SelectItem value="정규반">정규반</SelectItem>
              <SelectItem value="선택반">선택반</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="seat">좌석번호</Label>
          <Select name="seat" defaultValue={student?.seat || "none"}>
            <SelectTrigger>
              <SelectValue placeholder="좌석 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">미배정</SelectItem>
              {Array.from({ length: TOTAL_SEATS }, (_, i) => String(i + 1)).map((num) => {
                const isOccupied = occupiedSeats.includes(num);
                return (
                  <SelectItem key={num} value={num} disabled={isOccupied}>
                    {num}번{isOccupied ? " (사용중)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mentorId">담당 멘토</Label>
        <Select name="mentorId" defaultValue={student?.mentorId || "none"}>
          <SelectTrigger>
            <SelectValue placeholder="멘토 선택 (선택사항)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">미배정</SelectItem>
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

      {/* 학습 정보 */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">학습 정보 (멘토링용)</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="internalScoreRange">내신 성적대</Label>
            <Input id="internalScoreRange" name="internalScoreRange" defaultValue={student?.internalScoreRange || ""} placeholder="예: 2~3등급" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mockScoreRange">모의고사 성적대</Label>
            <Input id="mockScoreRange" name="mockScoreRange" defaultValue={student?.mockScoreRange || ""} placeholder="예: 3~4등급" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetUniversity">희망 대학</Label>
            <Input id="targetUniversity" name="targetUniversity" defaultValue={student?.targetUniversity || ""} placeholder="예: 연세대" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mentoringNotes">멘토링 주의사항</Label>
          <Textarea
            id="mentoringNotes"
            name="mentoringNotes"
            defaultValue={student?.mentoringNotes || ""}
            placeholder="멘토링 시 주의해야 할 사항, 성격, 특이사항 등..."
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="academySchedule">학원 스케줄</Label>
          <Textarea
            id="academySchedule"
            name="academySchedule"
            defaultValue={(student as { academySchedule?: string | null } | undefined)?.academySchedule || ""}
            placeholder="다니는 학원, 수강 시간 등 (예: 수학학원 월수금 17-19시, 영어학원 화목 18-20시)"
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="selectedSubjects">선택과목</Label>
            <Input
              id="selectedSubjects"
              name="selectedSubjects"
              defaultValue={(student as { selectedSubjects?: string | null } | undefined)?.selectedSubjects || ""}
              placeholder="예: 수학, 영어, 사탐(생활과윤리)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admissionType">입시 전형</Label>
            <Input
              id="admissionType"
              name="admissionType"
              defaultValue={(student as { admissionType?: string | null } | undefined)?.admissionType || ""}
              placeholder="예: 수시 학생부종합, 정시"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="onlineLectures">수강중인 인강</Label>
          <Input
            id="onlineLectures"
            name="onlineLectures"
            defaultValue={(student as { onlineLectures?: string | null } | undefined)?.onlineLectures || ""}
            placeholder="예: 메가스터디 수학(현우진), EBSi 국어"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="studentInfo">학생정보 메모</Label>
          <Textarea
            id="studentInfo"
            name="studentInfo"
            defaultValue={(student as { studentInfo?: string | null } | undefined)?.studentInfo || ""}
            placeholder="학생 특이사항, 성향, 추가 메모 등..."
            rows={2}
          />
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
