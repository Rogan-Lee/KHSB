"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutGrid, List, Plus, RotateCcw, SearchX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, FilterChip, SearchField, Segmented, TableCard, Toolbar } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { StudentsTable } from "./students-table";
import { StudentsCardGrid } from "./students-card-grid";
import type { Student, User, AttendanceSchedule } from "@/generated/prisma";

type StudentWithRelations = Student & {
  mentor: Pick<User, "name"> | null;
  schedules: AttendanceSchedule[];
};

interface StudentsListViewProps {
  students: StudentWithRelations[];
}

// 검색어·퇴원생 보기는 탭을 옮겨 다녀도 유지(세션 한정)
const STUDENTS_FILTER_KEY = "students-table-filters";
function loadStudentFilters(): { q?: string; withdrawn?: boolean } {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(sessionStorage.getItem(STUDENTS_FILTER_KEY) ?? "{}"); } catch { return {}; }
}

// FilterChip 과 같은 모양 — 드롭다운 트리거용
const CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center gap-x1 rounded-full px-x3 t3-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-stroke-focus-ring";
const CHIP_ON = "bg-bg-neutral-inverted text-fg-neutral-inverted";
const CHIP_OFF =
  "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed";

function ChipDivider() {
  return <span aria-hidden className="mx-x0_5 h-5 w-px bg-stroke-neutral-muted" />;
}

export function StudentsListView({ students }: StudentsListViewProps) {
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState<string>(() => loadStudentFilters().q ?? "");
  const [showWithdrawn, setShowWithdrawn] = useState<boolean>(() => loadStudentFilters().withdrawn ?? false);
  const [mentorFilter, setMentorFilter] = useState<string>("ALL");
  const [classGroup, setClassGroup] = useState<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STUDENTS_FILTER_KEY, JSON.stringify({ q: query, withdrawn: showWithdrawn })); } catch {}
  }, [query, showWithdrawn]);

  // 반(정규반/선택반 등) 칩 — 실데이터에 존재하는 값만 노출
  const classGroups = [...new Set(students.map((s) => s.classGroup).filter((g): g is string => !!g))].sort(
    (a, b) => a.localeCompare(b, "ko")
  );
  // 멘토 목록 (이름 가나다순)
  const mentorNames = [...new Set(students.map((s) => s.mentor?.name).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "ko")
  );

  const withdrawnCount = students.filter((s) => s.status === "WITHDRAWN").length;
  const enrolledCount = students.length - withdrawnCount;

  // 퇴원생 보기 모드: WITHDRAWN만 표시 / 기본: WITHDRAWN 제외
  const statusFiltered = showWithdrawn
    ? students.filter((s) => s.status === "WITHDRAWN")
    : students.filter((s) => s.status !== "WITHDRAWN");
  const byMentor = mentorFilter === "ALL" ? statusFiltered : statusFiltered.filter((s) => s.mentor?.name === mentorFilter);
  const byGroup = classGroup ? byMentor.filter((s) => s.classGroup === classGroup) : byMentor;
  const q = query.trim().toLowerCase();
  const visible = q
    ? byGroup.filter((s) =>
        [s.name, s.school, s.grade, s.mentor?.name, s.seat, s.phone, s.parentPhone].some((v) =>
          v?.toLowerCase().includes(q)
        )
      )
    : byGroup;

  const filtersActive = showWithdrawn || mentorFilter !== "ALL" || classGroup !== null || !!q;

  function resetFilters() {
    setQuery("");
    setShowWithdrawn(false);
    setMentorFilter("ALL");
    setClassGroup(null);
  }

  let content: React.ReactNode;
  if (students.length === 0) {
    content = (
      <TableCard>
        <EmptyState
          icon={Users}
          title="아직 등록된 원생이 없어요"
          description="원생을 등록하면 좌석·담당 멘토·연락처를 여기서 한눈에 볼 수 있어요."
          action={
            <Button asChild>
              <Link href="/students/new">
                <Plus />
                원생 등록
              </Link>
            </Button>
          }
        />
      </TableCard>
    );
  } else if (visible.length === 0 && (filtersActive || view === "grid")) {
    content = (
      <TableCard>
        <EmptyState
          icon={SearchX}
          title={filtersActive ? "조건에 맞는 원생이 없어요" : "재원 중인 원생이 없어요"}
          description={filtersActive ? "검색어나 필터를 바꿔 보세요." : undefined}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={resetFilters}>
                <RotateCcw />
                필터 초기화
              </Button>
            ) : undefined
          }
        />
      </TableCard>
    );
  } else if (view === "list") {
    content = <StudentsTable students={visible} allStudents={students} seatLayout={!filtersActive} />;
  } else {
    content = <StudentsCardGrid students={visible} />;
  }

  return (
    <div>
      <Toolbar>
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, 학교, 멘토, 좌석, 연락처 검색"
          aria-label="원생 검색"
          className="sm:w-80"
        />

        <FilterChip selected={!showWithdrawn} count={enrolledCount} onClick={() => setShowWithdrawn(false)}>
          재원생
        </FilterChip>
        <FilterChip selected={showWithdrawn} count={withdrawnCount} onClick={() => setShowWithdrawn(true)}>
          퇴원생
        </FilterChip>

        {classGroups.length > 0 && (
          <>
            <ChipDivider />
            {[null, ...classGroups].map((g) => (
              <FilterChip
                key={g ?? "__all"}
                selected={classGroup === g}
                count={g ? byMentor.filter((s) => s.classGroup === g).length : undefined}
                onClick={() => setClassGroup(g)}
              >
                {g ?? "전체 반"}
              </FilterChip>
            ))}
          </>
        )}

        {mentorNames.length > 0 && (
          <>
            <ChipDivider />
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(CHIP_BASE, mentorFilter !== "ALL" ? CHIP_ON : CHIP_OFF)}>
                {mentorFilter === "ALL" ? "담당 멘토" : mentorFilter}
                <ChevronDown className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                <DropdownMenuLabel>담당 멘토</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={mentorFilter} onValueChange={setMentorFilter}>
                  <DropdownMenuRadioItem value="ALL">전체</DropdownMenuRadioItem>
                  {mentorNames.map((n) => (
                    <DropdownMenuRadioItem key={n} value={n}>
                      {n}
                      <span className="ml-auto pl-x4 t3-regular text-fg-neutral-subtle tabular-nums">
                        {statusFiltered.filter((s) => s.mentor?.name === n).length}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {filtersActive && (
          <Button variant="ghost" size="xs" onClick={resetFilters}>
            <RotateCcw />
            초기화
          </Button>
        )}

        <div className="flex w-full items-center justify-between gap-x3 sm:ml-auto sm:w-auto">
          <span className="t3-regular text-fg-neutral-subtle tabular-nums">
            {filtersActive ? `${visible.length}명 / 전체 ${students.length}명` : `${visible.length}명`}
          </span>
          <Segmented
            aria-label="보기 방식"
            value={view}
            onChange={setView}
            className="w-auto"
            options={[
              {
                value: "list",
                label: (
                  <span className="inline-flex items-center gap-x1">
                    <List className="size-4" aria-hidden />
                    목록
                  </span>
                ),
              },
              {
                value: "grid",
                label: (
                  <span className="inline-flex items-center gap-x1">
                    <LayoutGrid className="size-4" aria-hidden />
                    카드
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Toolbar>

      {content}
    </div>
  );
}
