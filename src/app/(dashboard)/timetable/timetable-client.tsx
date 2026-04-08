"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { getTimetableEntries, getAttendanceAutoBlocks, getStudentSchoolEvents, type SchoolEventInfo } from "@/actions/timetable";
import { TimetableGrid, TimetableEntry, AutoBlock } from "@/components/timetable/timetable-grid";
import { DayView } from "@/components/timetable/day-view";
import { Search, X, User, GraduationCap, School, CalendarDays, Calendar } from "lucide-react";
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
    <div className="space-y-4">
      {/* ── 멘토 필터 ── */}
      {mentors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">멘토:</span>
          <button
            onClick={() => { setSelectedMentorId(null); setQuery(""); }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
              !selectedMentorId ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-accent"
            )}
          >전체</button>
          {mentors.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelectedMentorId(m.id); setQuery(""); setDropdownOpen(true); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                selectedMentorId === m.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-accent"
              )}
            >{m.name}</button>
          ))}
          {selectedMentorId && (
            <span className="text-xs text-muted-foreground">({byMentor.length}명)</span>
          )}
        </div>
      )}

      {/* ── Student Info Header ── */}
      <div className="flex items-stretch gap-0 rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm">
        {/* Info area */}
        <div className="flex-1 flex items-center gap-0 divide-x divide-border/50">
          {selected ? (
            <>
              <div className="flex items-center gap-2.5 px-5 py-3.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">이름</p>
                  <p className="font-bold text-base leading-tight truncate">{selected.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-5 py-3.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                  <School className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">학교</p>
                  <p className="font-semibold text-sm leading-tight truncate">
                    {selected.school ?? <span className="text-muted-foreground text-xs">미입력</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-5 py-3.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5">학년</p>
                  <p className="font-semibold text-sm leading-tight truncate">
                    {selected.grade ?? <span className="text-muted-foreground text-xs">미입력</span>}
                  </p>
                </div>
              </div>

              {/* View mode tabs — only shown when student is selected */}
              <div className="flex items-center gap-1.5 px-5 py-3.5">
                <button
                  onClick={() => setViewMode("weekly")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    viewMode === "weekly"
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  주간
                </button>
                <button
                  onClick={() => setViewMode("daily")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    viewMode === "daily"
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  일간
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 px-5 py-3.5 text-muted-foreground">
              <User className="h-5 w-5 opacity-40" />
              <span className="text-sm">오른쪽에서 원생을 검색하여 시간표를 확인하세요</span>
            </div>
          )}
        </div>

        <div className="w-px bg-border/50" />

        {/* Searchable selector */}
        <div ref={searchRef} className="relative w-64 shrink-0">
          <div className="flex items-center h-full px-4 gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={selected ? selected.name : "원생 검색..."}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              className={cn(
                "flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60",
                selected && !query && "placeholder:text-foreground placeholder:font-medium"
              )}
            />
            {selected && (
              <button onClick={clearStudent} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {dropdownOpen && (
            <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-xl border border-border/60 bg-white dark:bg-background shadow-lg overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">검색 결과 없음</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {filtered.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors",
                          selected?.id === s.id && "bg-blue-50 dark:bg-blue-950/20"
                        )}
                        onClick={() => selectStudent(s)}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold mt-0.5">
                          {s.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-sm font-semibold leading-tight", selected?.id === s.id && "text-blue-600")}>
                            {s.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {[s.school, s.grade].filter(Boolean).join(" · ") || "정보 없음"}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {loading && (
        <p className="text-sm text-muted-foreground text-center py-10">불러오는 중...</p>
      )}

      {!loading && !selected && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
            <GraduationCap className="h-8 w-8 opacity-30" />
          </div>
          <p className="text-sm font-medium">원생을 선택하면 시간표를 편집할 수 있습니다</p>
          <p className="text-xs opacity-60">빈 칸 드래그로 일정 추가 · 일정 클릭으로 수정</p>
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
