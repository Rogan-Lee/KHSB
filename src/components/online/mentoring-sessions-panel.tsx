"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ExternalLink, Video, CalendarClock, History } from "lucide-react";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import {
  MentoringSessionsSection,
  type MentoringSessionRow,
} from "@/components/online/mentoring-sessions-section";

export type MentoringPanelStudentRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  assignedMentorName: string | null;
  sessions: MentoringSessionRow[];
};

export function MentoringSessionsPanel({
  rows,
}: {
  rows: MentoringPanelStudentRow[];
}) {
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  // 처음엔 가장 가까운 예정 세션 보유 학생 자동 선택
  const initialActive = useMemo(() => {
    const withUpcoming = rows
      .map((r) => {
        const next = r.sessions
          .filter(
            (s) =>
              (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") &&
              new Date(s.scheduledAt).getTime() > Date.now()
          )
          .sort(
            (a, b) =>
              new Date(a.scheduledAt).getTime() -
              new Date(b.scheduledAt).getTime()
          )[0];
        return next ? { studentId: r.studentId, at: new Date(next.scheduledAt).getTime() } : null;
      })
      .filter((v): v is { studentId: string; at: number } => v !== null)
      .sort((a, b) => a.at - b.at);
    return withUpcoming[0]?.studentId ?? rows[0]?.studentId ?? null;
  }, [rows]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(initialActive);

  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);
  const filteredRows = useMemo(
    () => rows.filter((r) => matchesStudentFilter(r, filter)),
    [rows, filter]
  );
  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  return (
    <div className="space-y-3">
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={
          <span className="text-[11px] text-ink-5 tabular-nums">
            {filteredRows.length} / {rows.length}명
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측 학생 리스트 */}
        <aside className="border border-line rounded-lg bg-panel overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-line text-[11px] text-ink-5 flex items-center justify-between">
            <span>학생을 선택하세요</span>
            <span className="tabular-nums">총 {filteredRows.length}명</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[680px]">
            {filteredRows.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-5">
                조건에 맞는 학생이 없습니다
              </p>
            ) : (
              filteredRows.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const upcoming = r.sessions.filter(
                  (s) =>
                    (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") &&
                    new Date(s.scheduledAt).getTime() > Date.now()
                );
                const completed = r.sessions.filter((s) => s.status === "COMPLETED");
                const nextSession = upcoming.sort(
                  (a, b) =>
                    new Date(a.scheduledAt).getTime() -
                    new Date(b.scheduledAt).getTime()
                )[0];
                return (
                  <button
                    type="button"
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-l-2 transition-colors block",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-canvas-2/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-ink truncate">
                        {r.studentName}
                      </span>
                      <span className="text-[10.5px] text-ink-5">{r.grade}</span>
                      <div className="ml-auto inline-flex items-center gap-1 shrink-0">
                        {upcoming.length > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-px text-[10px] font-semibold"
                            title={`예정 ${upcoming.length}건`}
                          >
                            <Video className="h-2.5 w-2.5" />
                            {upcoming.length}
                          </span>
                        )}
                        {completed.length > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-px text-[10px]"
                            title={`완료 ${completed.length}건`}
                          >
                            <History className="h-2.5 w-2.5" />
                            {completed.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[10.5px] text-ink-5 flex items-center gap-1.5 flex-wrap">
                      {r.school ? (
                        <span className="truncate">{r.school}</span>
                      ) : (
                        <span>학교 미입력</span>
                      )}
                      <span>·</span>
                      <span>
                        멘토 {r.assignedMentorName ?? <span className="text-amber-700">미배정</span>}
                      </span>
                    </div>
                    {nextSession && (
                      <div className="mt-1 text-[10.5px] text-blue-700 inline-flex items-center gap-1">
                        <CalendarClock className="h-2.5 w-2.5" />
                        다음:{" "}
                        {new Date(nextSession.scheduledAt).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          month: "2-digit",
                          day: "2-digit",
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 우측 세션 패널 */}
        <main className="border border-line rounded-lg bg-panel flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-5">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* 헤더 */}
              <div className="px-5 py-3 border-b border-line flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-ink">
                      {activeRow.studentName}
                    </h3>
                    <span className="text-xs text-ink-5">{activeRow.grade}</span>
                    {activeRow.school && (
                      <span className="text-xs text-ink-5">· {activeRow.school}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-5 mt-0.5">
                    {activeRow.assignedMentorName
                      ? `담당 멘토: ${activeRow.assignedMentorName}`
                      : "담당 멘토 미배정"}
                    {" · "}
                    총 세션{" "}
                    <b className="text-ink-3">{activeRow.sessions.length}</b>건
                  </p>
                </div>
                <Link
                  href={`/online/students/${activeRow.studentId}`}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong"
                  title="이 학생 상세 페이지로 이동"
                >
                  <ExternalLink className="h-3 w-3" />
                  학생 상세
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <MentoringSessionsSection
                  studentId={activeRow.studentId}
                  sessions={activeRow.sessions}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
