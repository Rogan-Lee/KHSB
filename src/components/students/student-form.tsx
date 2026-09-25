"use client";

import { useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { createStudent, updateStudent } from "@/actions/students";
import { GRADE_OPTIONS, cn, parseSchool } from "@/lib/utils";
import { KOREAN_ELECTIVES, MATH_ELECTIVES, INQUIRY_SUBJECTS } from "@/lib/online/subjects";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { ChevronDown, ImagePlus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormActions, FormField } from "@/components/backoffice/ui";
import type { Student, User } from "@/generated/prisma";

const TOTAL_SEATS = 89;

// 입력 아래 펼쳐지는 선택 목록 — ui/dropdown-menu 와 같은 떠 있는 레이어 모양
const POPUP =
  "absolute z-50 mt-x1 max-h-56 w-full overflow-auto rounded-r3 bg-bg-layer-floating p-x1_5 shadow-[var(--seed-shadow-s3)]";
const OPTION =
  "w-full rounded-r2 px-x3 py-x2 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed";
const OPTION_ON = "bg-bg-layer-floating-pressed t4-medium";

interface StudentFormProps {
  student?: Student;
  mentors: Pick<User, "id" | "name">[];
  schools?: string[];
  occupiedSeats?: string[];
}

function SeatCombobox({ name, defaultValue, occupiedSeats }: { name: string; defaultValue?: string; occupiedSeats: string[] }) {
  const [value, setValue] = useState(defaultValue || "none");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const allSeats = Array.from({ length: TOTAL_SEATS }, (_, i) => String(i + 1));
  const filtered = query
    ? allSeats.filter((s) => s.startsWith(query))
    : allSeats;
  const sortedFiltered = [...filtered].sort((a, b) => {
    const aOcc = occupiedSeats.includes(a) ? 1 : 0;
    const bOcc = occupiedSeats.includes(b) ? 1 : 0;
    return aOcc - bOcc || Number(a) - Number(b);
  });

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Input
          value={open ? query : value === "none" ? "" : `${value}번`}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "");
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="좌석 검색 (번호 입력)"
          autoComplete="off"
          className="pr-8"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-neutral-subtle" />
      </div>
      {open && (
        <div className={POPUP}>
          <button
            type="button"
            className={cn(OPTION, value === "none" && OPTION_ON)}
            onMouseDown={() => { setValue("none"); setQuery(""); setOpen(false); }}
          >
            미배정
          </button>
          {sortedFiltered.map((num) => {
            const isOccupied = occupiedSeats.includes(num);
            return (
              <button
                key={num}
                type="button"
                disabled={isOccupied}
                className={cn(OPTION, "tabular-nums", isOccupied && "cursor-not-allowed text-fg-disabled", value === num && OPTION_ON)}
                onMouseDown={() => { if (!isOccupied) { setValue(num); setQuery(""); setOpen(false); } }}
              >
                {num}번{isOccupied ? " (사용중)" : ""}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-x3 py-x2 t4-regular text-fg-neutral-subtle">결과 없음</p>
          )}
        </div>
      )}
    </div>
  );
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
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-neutral-subtle" />
      </div>
      {open && filtered.length > 0 && (
        <div className={POPUP}>
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className={OPTION}
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

function ProfileImageUploader({ defaultValue }: { defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setUrl(json.url);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "이미지 업로드에 실패했습니다");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-x4">
      <input type="hidden" name="imageUrl" value={url} />
      <Avatar className="size-x14">
        {url && <AvatarImage src={url} alt="프로필 이미지" className="object-cover" />}
        <AvatarFallback className="bg-bg-neutral-weak text-fg-neutral-subtle">
          <ImagePlus className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap items-center gap-x2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "업로드 중…" : url ? "이미지 변경" : "이미지 선택"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => setUrl("")}>
            <X />
            제거
          </Button>
        )}
      </div>
    </div>
  );
}

export function StudentForm({ student, mentors, schools = [], occupiedSeats = [] }: StudentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [mentorId, setMentorId] = useState(student?.mentorId ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        if (student) {
          await updateStudent(student.id, formData);
          toast.success("원생 정보가 수정되었습니다");
          router.back();
        } else {
          await createStudent(formData);
          toast.success("원생이 등록되었습니다");
        }
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

  const defaultBirthDate = student?.birthDate
    ? new Date(student.birthDate).toISOString().split("T")[0]
    : "";

  const subjectSelect = cn(inputBaseClass, "h-10 px-x3");

  return (
    <form action={handleSubmit} ref={formRef} className="flex flex-col">
      <FormGroup title="프로필">
        <FormField label="프로필 이미지" className="sm:col-span-2">
          <ProfileImageUploader defaultValue={student?.imageUrl || ""} />
        </FormField>
      </FormGroup>

      <FormGroup title="기본 정보">
        <FormField label="이름" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={student?.name} required />
        </FormField>
        <FormField label="학년" htmlFor="grade" required>
          <Select name="grade" defaultValue={student?.grade}>
            <SelectTrigger id="grade">
              <SelectValue placeholder="학년 선택" />
            </SelectTrigger>
            <SelectContent>
              {GRADE_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="학교" htmlFor="school">
          <SchoolCombobox name="school" defaultValue={student?.school || ""} options={schools} />
        </FormField>
        <FormField label="반" htmlFor="classGroup" hint="입퇴실 일정 저장 시 자동 갱신 (3회까지 선택반 · 4회+ 정규반)">
          <Select name="classGroup" defaultValue={student?.classGroup || "none"}>
            <SelectTrigger id="classGroup">
              <SelectValue placeholder="반 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">미배정</SelectItem>
              <SelectItem value="정규반">정규반</SelectItem>
              <SelectItem value="선택반">선택반</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="좌석번호" htmlFor="seat">
          <SeatCombobox name="seat" defaultValue={student?.seat || "none"} occupiedSeats={occupiedSeats} />
        </FormField>
        <FormField label="담당 멘토" htmlFor="mentorId">
          <Combobox
            name="mentorId"
            value={mentorId}
            onChange={setMentorId}
            items={mentors.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="멘토 선택 (선택사항)"
            searchPlaceholder="멘토 이름 검색…"
            allowEmpty
            emptyLabel="미배정"
            popoverClassName="w-[--radix-popover-trigger-width]"
          />
        </FormField>
      </FormGroup>

      <FormGroup title="연락처">
        <FormField label="학생 연락처" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={student?.phone || ""} placeholder="010-0000-0000" />
        </FormField>
        <FormField label="학부모 연락처" htmlFor="parentPhone" required>
          <Input id="parentPhone" name="parentPhone" defaultValue={student?.parentPhone} required placeholder="010-0000-0000" />
        </FormField>
        <FormField label="학부모 이메일" htmlFor="parentEmail" className="sm:col-span-2">
          <Input id="parentEmail" name="parentEmail" type="email" defaultValue={student?.parentEmail || ""} placeholder="parent@example.com" />
        </FormField>
      </FormGroup>

      <FormGroup title="등록 정보" cols={3}>
        <FormField label="등원일" required>
          <DatePicker name="startDate" defaultValue={defaultDate} required placeholder="등원일 선택" />
        </FormField>
        <FormField label="퇴원예정일">
          <DatePicker name="endDate" defaultValue={defaultEndDate || undefined} placeholder="퇴원예정일 선택" />
        </FormField>
        <FormField label="생년월일">
          <DatePicker name="birthDate" defaultValue={defaultBirthDate || undefined} placeholder="생년월일 선택" />
        </FormField>
      </FormGroup>

      {/* 학습 정보 */}
      <FormGroup title="학습 정보" description="멘토링할 때 참고하는 정보예요">
        <div className="grid grid-cols-1 gap-x4 sm:col-span-2 sm:grid-cols-3">
          <FormField label="내신 성적대" htmlFor="internalScoreRange">
            <Input id="internalScoreRange" name="internalScoreRange" defaultValue={student?.internalScoreRange || ""} placeholder="예: 2~3등급" />
          </FormField>
          <FormField label="모의고사 성적대" htmlFor="mockScoreRange">
            <Input id="mockScoreRange" name="mockScoreRange" defaultValue={student?.mockScoreRange || ""} placeholder="예: 3~4등급" />
          </FormField>
          <FormField label="희망 대학" htmlFor="targetUniversity">
            <Input id="targetUniversity" name="targetUniversity" defaultValue={student?.targetUniversity || ""} placeholder="예: 연세대" />
          </FormField>
        </div>
        <FormField label="멘토링 주의사항" htmlFor="mentoringNotes" className="sm:col-span-2">
          <Textarea
            id="mentoringNotes"
            name="mentoringNotes"
            defaultValue={student?.mentoringNotes || ""}
            placeholder="멘토링 시 주의해야 할 사항, 성격, 특이사항 등..."
            rows={2}
          />
        </FormField>
        <FormField label="선택과목" htmlFor="selectedSubjects">
          <Input
            id="selectedSubjects"
            name="selectedSubjects"
            defaultValue={(student as { selectedSubjects?: string | null } | undefined)?.selectedSubjects || ""}
            placeholder="예: 수학, 영어, 사탐(생활과윤리)"
          />
        </FormField>
        <FormField label="입시 전형" htmlFor="admissionType">
          <Input
            id="admissionType"
            name="admissionType"
            defaultValue={(student as { admissionType?: string | null } | undefined)?.admissionType || ""}
            placeholder="예: 수시 학생부종합, 정시"
          />
        </FormField>
        {/* 국어/수학 선택과목 + 탐구 과목 (평가원 성적표 구조) */}
        <div className="grid grid-cols-2 gap-x4 sm:col-span-2 sm:grid-cols-4">
          {([
            { name: "koreanElective", label: "국어 선택", options: KOREAN_ELECTIVES as readonly string[], current: (student as { koreanElective?: string | null } | undefined)?.koreanElective },
            { name: "mathElective", label: "수학 선택", options: MATH_ELECTIVES as readonly string[], current: (student as { mathElective?: string | null } | undefined)?.mathElective },
            { name: "inquiry1Subject", label: "탐구1", options: INQUIRY_SUBJECTS as readonly string[], current: (student as { inquiry1Subject?: string | null } | undefined)?.inquiry1Subject },
            { name: "inquiry2Subject", label: "탐구2", options: INQUIRY_SUBJECTS as readonly string[], current: (student as { inquiry2Subject?: string | null } | undefined)?.inquiry2Subject },
          ] as const).map((f) => (
            <FormField key={f.name} label={f.label} htmlFor={f.name}>
              <select
                id={f.name}
                name={f.name}
                defaultValue={f.current || "none"}
                className={subjectSelect}
              >
                <option value="none">선택 안 함</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
          ))}
        </div>
        <FormField label="수강중인 인강" htmlFor="onlineLectures" className="sm:col-span-2">
          <Input
            id="onlineLectures"
            name="onlineLectures"
            defaultValue={(student as { onlineLectures?: string | null } | undefined)?.onlineLectures || ""}
            placeholder="예: 메가스터디 수학(현우진), EBSi 국어"
          />
        </FormField>
        <FormField label="학생정보 메모" htmlFor="studentInfo" className="sm:col-span-2">
          <Textarea
            id="studentInfo"
            name="studentInfo"
            defaultValue={(student as { studentInfo?: string | null } | undefined)?.studentInfo || ""}
            placeholder="학생 특이사항, 성향, 추가 메모 등..."
            rows={2}
          />
        </FormField>
      </FormGroup>

      <FormActions className="border-t border-stroke-neutral-muted pt-x5 max-sm:[&>*]:flex-1">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "저장 중…" : student ? "수정" : "등록"}
        </Button>
      </FormActions>
    </form>
  );
}

/** 폼 묶음 — 제목 + 2열(또는 3열) 입력 격자, 묶음 사이 옅은 구분선 */
function FormGroup({
  title,
  description,
  cols = 2,
  children,
}: {
  title: string;
  description?: string;
  cols?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-x4 border-t border-stroke-neutral-muted py-x6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="t5-bold text-fg-neutral">{title}</h3>
        {description && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{description}</p>}
      </div>
      <div className={cn("grid grid-cols-1 gap-x4", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>
    </section>
  );
}
