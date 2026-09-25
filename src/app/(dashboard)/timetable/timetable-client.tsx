"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { getTimetableEntries, getAttendanceAutoBlocks, getStudentSchoolEvents, type SchoolEventInfo } from "@/actions/timetable";
import { TimetableGrid, TimetableEntry, AutoBlock } from "@/components/timetable/timetable-grid";
import { DayView } from "@/components/timetable/day-view";
import { Avatar, EmptyState, FilterChip, SearchField, Segmented, Skeleton } from "@/components/backoffice/ui";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentInfo {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  mentorId: string | null;
}

interface MentorInfo {
  id: string;
  name: string;
}

interface Props {
  students: StudentInfo[];
  mentors: MentorInfo[];
}

type ViewMode = "weekly" | "daily";

export function TimetablePageClient({ students, mentors }: Props) {
  const [selected, setSelected] = useState<StudentInfo | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [autoBlocks, setAutoBlocks] = useState<AutoBlock[]>([]);
  const [schoolEvents, setSchoolEvents] = useState<SchoolEventInfo[]>([]);
  const [loading, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");

  // Mentor filter
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const byMentor = selectedMentorId
    ? students.filter((s) => s.mentorId === selectedMentorId)
    : students;

  const filtered = query.trim()
    ? byMentor.filter(
        (s) =>
          s.name.includes(query) ||
          (s.school ?? "").includes(query) ||
          (s.grade ?? "").includes(query)
      )
    : byMentor;

  function selectStudent(s: StudentInfo) {
    setSelected(s);
    setQuery("");
    setDropdownOpen(false);
    startTransition(async () => {
      const from = new Date(); from.setMonth(from.getMonth() - 3);
      const to = new Date(); to.setMonth(to.getMonth() + 3);
      const [data, blocks, evts] = await Promise.all([
        getTimetableEntries(s.id),
        getAttendanceAutoBlocks(s.id),
        getStudentSchoolEvents(s.id, from, to),
      ]);
      setEntries(data.map((e) => ({ ...e, details: e.details ?? null })));
      setAutoBlocks(blocks);
      setSchoolEvents(evts);
    });
  }

  function clearStudent() {
    setSelected(null);
    setEntries([]);
    setAutoBlocks([]);
    setSchoolEvents([]);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-x5">
      {/* ── 원생 선택 ── */}
      <section className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5">
        <div className="flex flex-col gap-x4 lg:flex-row lg:items-center lg:justify-between">
          {selected ? (
            <div className="flex min-w-0 items-center gap-x3">
              <Avatar name={selected.name} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-x1">
                  <p className="truncate t7-bold text-fg-neutral">{selected.name}</p>
                  <button
                    type="button"
                    onClick={clearStudent}
                    aria-label="선택 해제"
                    title="선택 해제"
                    className="grid size-x7 shrink-0 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <p className="truncate t4-regular text-fg-neutral-subtle">
                  {[selected.school ?? "학교 미입력", selected.grade ?? "학년 미입력"].join(" · ")}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="t5-bold text-fg-neutral">원생을 선택해 주세요</p>
              <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
                이름·학교·학년으로 검색하거나 담당 멘토로 좁혀 보세요
              </p>
            </div>
          )}

          <div className="flex flex-col gap-x2 sm:flex-row sm:items-center">
            {selected && (
              <Segmented
                aria-label="보기 전환"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "weekly", label: "주간" },
                  { value: "daily", label: "일간" },
                ]}
                className="sm:w-40"
              />
            )}

            {/* Searchable selector */}
            <div ref={searchRef} className="relative w-full sm:w-72">
              <SearchField
                placeholder="원생 검색 (이름·학교·학년)"
                aria-label="원생 검색"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                className="sm:w-full"
              />

              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-x1 w-full overflow-hidden rounded-r3 bg-bg-layer-floating shadow-[var(--seed-shadow-s3)]">
                  {filtered.length === 0 ? (
                    <p className="px-x4 py-x4 t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto py-x1_5">
                      {filtered.map((s) => {
                        const isSel = selected?.id === s.id;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-x3 px-x4 py-x2 text-left transition-colors hover:bg-bg-layer-floating-pressed",
                                isSel && "bg-bg-brand-weak"
                              )}
                              onClick={() => selectStudent(s)}
                            >
                              <Avatar name={s.name} size={32} />
                              <div className="min-w-0">
                                <p className={cn("truncate t4-medium", isSel ? "text-fg-brand" : "text-fg-neutral")}>
                                  {s.name}
                                </p>
                                <p className="truncate t3-regular text-fg-neutral-subtle">
                                  {[s.school, s.grade].filter(Boolean).join(" · ") || "정보 없음"}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 멘토 필터 + 담당 학생 바로 선택 ── */}
        {mentors.length > 0 && (
          <div className="mt-x4 flex flex-col gap-x3 border-t border-stroke-neutral-muted pt-x4">
            <div className="flex flex-wrap items-center gap-x1_5">
              <span className="mr-x1 shrink-0 t3-medium text-fg-neutral-subtle">담당 멘토</span>
              <FilterChip selected={!selectedMentorId} onClick={() => setSelectedMentorId(null)}>
                전체
              </FilterChip>
              {mentors.map((m) => {
                const count = students.filter((s) => s.mentorId === m.id).length;
                return (
                  <FilterChip
                    key={m.id}
                    selected={selectedMentorId === m.id}
                    count={count}
                    onClick={() => setSelectedMentorId(selectedMentorId === m.id ? null : m.id)}
                  >
                    {m.name}
                  </FilterChip>
                );
              })}
            </div>
            {/* 멘토 선택 시 담당 학생 칩 — 바로 클릭 가능 */}
            {selectedMentorId && byMentor.length > 0 && (
              <div className="flex flex-wrap items-center gap-x1_5">
                <span className="mr-x1 shrink-0 t3-medium text-fg-neutral-subtle">담당 원생</span>
                {byMentor.map((s) => {
                  const isSel = selected?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => selectStudent(s)}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-x1 rounded-full px-x3 t3-medium transition-colors",
                        isSel
                          ? "bg-bg-brand-weak text-fg-brand shadow-[inset_0_0_0_1px_var(--seed-color-stroke-brand-weak)]"
                          : "bg-bg-layer-default text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed"
                      )}
                    >
                      {s.name}
                      {s.grade && (
                        <span className={isSel ? "text-fg-brand" : "text-fg-neutral-subtle"}>{s.grade}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Content ── */}
      {loading && (
        <div className="flex flex-col gap-x3" aria-busy="true" aria-label="시간표 불러오는 중">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {!loading && !selected && (
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <EmptyState
            icon={CalendarDays}
            title="원생을 선택하면 시간표가 보여요"
            description={"빈 칸을 드래그해 일정을 추가하고,\n일정을 누르면 수정할 수 있어요."}
          />
        </div>
      )}

      {!loading && selected && viewMode === "weekly" && (
        <TimetableGrid
          key={`weekly-${selected.id}`}
          studentId={selected.id}
          studentName={selected.name}
          initialEntries={entries}
          autoBlocks={autoBlocks}
          schoolEvents={schoolEvents}
        />
      )}

      {!loading && selected && viewMode === "daily" && (
        <DayView
          key={`daily-${selected.id}`}
          studentId={selected.id}
          entries={entries}
          schoolEvents={schoolEvents}
        />
      )}
    </div>
  );
}
