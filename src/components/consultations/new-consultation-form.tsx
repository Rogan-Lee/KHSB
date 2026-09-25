"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { createConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FormActions, FormField, PageHeader, Section, Segmented } from "@/components/backoffice/ui";

interface Props {
  students: { id: string; name: string; grade: string }[];
  owner?: "DIRECTOR" | "HEAD_TEACHER";
}

function StudentCombobox({
  students,
  value,
  onChange,
}: {
  students: Props["students"];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = students.find((s) => s.id === value);

  const filtered = students.filter((s) => {
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q);
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-x2 rounded-r2 bg-bg-layer-default px-x3 text-left t4-regular shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
          open && "shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
          selected ? "text-fg-neutral" : "text-fg-placeholder"
        )}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.grade})` : "원생을 검색하세요..."}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-x1 w-full overflow-hidden rounded-r3 bg-bg-layer-floating shadow-[var(--seed-shadow-s3)]">
          <div className="flex items-center gap-x2 border-b border-stroke-neutral-muted px-x3 py-x2_5">
            <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
            <input
              autoFocus
              type="text"
              placeholder="이름으로 검색..."
              aria-label="원생 이름 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-x1_5" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={value === s.id}
                  onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex w-full items-center gap-x2 px-x3 py-x2_5 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed",
                    value === s.id && "t4-medium"
                  )}
                >
                  <Check className={cn("size-4 shrink-0 text-fg-brand", value === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{s.name} ({s.grade})</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type CType = "STUDENT" | "PARENT";
type CCategory = "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING";

const TYPE_OPTIONS: { value: CType; label: string }[] = [
  { value: "STUDENT", label: "학생 상담" },
  { value: "PARENT", label: "학부모 상담" },
];
const CATEGORY_OPTIONS_DIRECTOR: { value: CCategory; label: string }[] = [
  { value: "ENROLLED", label: "재원생" },
  { value: "NEW_ADMISSION", label: "신규 입실" },
  { value: "CONSIDERING", label: "등록 고민" },
];
const CATEGORY_OPTIONS_HEAD_TEACHER: { value: CCategory; label: string }[] = [
  { value: "ENROLLED", label: "재원생" },
  { value: "NEW_ADMISSION", label: "신규 학생" },
];

export function NewConsultationForm({ students, owner = "DIRECTOR" }: Props) {
  const router = useRouter();
  const isHeadTeacher = owner === "HEAD_TEACHER";
  const CATEGORY_OPTIONS = isHeadTeacher ? CATEGORY_OPTIONS_HEAD_TEACHER : CATEGORY_OPTIONS_DIRECTOR;
  const [consultType, setConsultType] = useState<CType>("STUDENT");
  const [consultCategory, setConsultCategory] = useState<CCategory>("ENROLLED");
  const [studentId, setStudentId] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [prospectGrade, setProspectGrade] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [agenda, setAgenda] = useState("");
  const [isPending, startTransition] = useTransition();

  const isRegistered = consultCategory === "ENROLLED";
  const isValid = isRegistered ? !!studentId : !!prospectName.trim();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) {
      toast.error(isRegistered ? "원생을 선택하세요" : "이름을 입력하세요");
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("type", consultType);
    fd.set("category", consultCategory);
    if (isRegistered) {
      fd.set("studentId", studentId);
    } else {
      fd.delete("studentId");
      fd.set("prospectName", prospectName);
      fd.set("prospectGrade", prospectGrade);
      fd.set("prospectPhone", prospectPhone);
    }
    fd.set("agenda", agenda);
    fd.set("owner", owner);

    startTransition(async () => {
      try {
        await createConsultation(fd);
        toast.success("면담이 등록되었습니다");
        router.push(isHeadTeacher ? "/consultations?owner=HEAD_TEACHER" : "/consultations");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  const listHref = isHeadTeacher ? "/consultations?owner=HEAD_TEACHER" : "/consultations";

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: listHref, label: "면담 목록" }}
        title={isHeadTeacher ? "책임T 면담 등록" : "원장 면담 등록"}
        description="면담 일정을 등록하고 주제를 미리 작성할 수 있어요."
      />

      <form onSubmit={handleSubmit}>
        <Section>
          <div className="flex flex-col gap-x6">
            {/* 상담 유형 + 분류 */}
            <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
              {/* 유형: 학생/학부모 (책임T는 학생 상담만) */}
              {!isHeadTeacher && (
                <FormField label="상담 유형">
                  <Segmented
                    aria-label="상담 유형"
                    value={consultType}
                    onChange={setConsultType}
                    options={TYPE_OPTIONS}
                  />
                </FormField>
              )}

              {/* 분류: 재원생/신규 학생 */}
              <FormField label="상담 분류">
                <Segmented
                  aria-label="상담 분류"
                  value={consultCategory}
                  onChange={(v) => {
                    setConsultCategory(v);
                    if (v === "ENROLLED") { setProspectName(""); setProspectGrade(""); setProspectPhone(""); }
                    else { setStudentId(""); }
                  }}
                  options={CATEGORY_OPTIONS}
                />
              </FormField>
            </div>

            {/* 원생 & 일시 */}
            <div className="grid grid-cols-1 gap-x5 md:grid-cols-2">
              {isRegistered ? (
                <FormField label="원생" required>
                  <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
                </FormField>
              ) : (
                <div className="flex flex-col gap-x4">
                  <FormField label="이름" required htmlFor="prospect-name">
                    <Input
                      id="prospect-name"
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="상담 학생 이름"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-x3">
                    <FormField label="학년" htmlFor="prospect-grade">
                      <Input
                        id="prospect-grade"
                        value={prospectGrade}
                        onChange={(e) => setProspectGrade(e.target.value)}
                        placeholder="예: 고2"
                      />
                    </FormField>
                    <FormField label="연락처" htmlFor="prospect-phone">
                      <Input
                        id="prospect-phone"
                        value={prospectPhone}
                        onChange={(e) => setProspectPhone(e.target.value)}
                        placeholder="학부모 또는 학생"
                      />
                    </FormField>
                  </div>
                </div>
              )}
              <FormField label="예정 일시">
                <DateTimePickerInput name="scheduledAt" />
              </FormField>
            </div>

            {/* 면담 주제 — 마크다운 */}
            <FormField label="면담 주제" hint="마크다운 문법과 이미지 첨부를 지원해요.">
              <div className="min-h-[300px] overflow-hidden rounded-r2 border border-stroke-neutral-weak">
                <MarkdownEditor
                  value={agenda}
                  onChange={setAgenda}
                  placeholder="면담에서 다룰 주제를 자유롭게 작성하세요..."
                />
              </div>
            </FormField>

            {/* 버튼 */}
            <FormActions className="border-t border-stroke-neutral-muted pt-x5 [&>*]:max-sm:flex-1">
              <Button type="button" variant="outline" asChild>
                <Link href={listHref}>취소</Link>
              </Button>
              <Button type="submit" disabled={isPending || !isValid}>
                {isPending ? "저장 중…" : "면담 등록"}
              </Button>
            </FormActions>
          </div>
        </Section>
      </form>
    </div>
  );
}
