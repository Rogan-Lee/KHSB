"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/backoffice/ui";
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
import {
  DetailPane,
  DetailPaneEmpty,
  DetailPaneHeader,
  MasterDetail,
  PickerCount,
  PickerItem,
  PickerList,
} from "@/components/online/student-picker";

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
    <div className="flex flex-col gap-x4">
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={<PickerCount shown={filteredRows.length} total={rows.length} />}
      />

      <MasterDetail
        list={
          <PickerList
            header={
              <>
                <span>학생을 선택하세요</span>
                <span className="tabular-nums">{filteredRows.length}명</span>
              </>
            }
            isEmpty={filteredRows.length === 0}
          >
            {filteredRows.map((r) => {
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
                <PickerItem
                  key={r.studentId}
                  active={activeStudentId === r.studentId}
                  onClick={() => setActiveStudentId(r.studentId)}
                  name={r.studentName}
                  grade={r.grade}
                  badges={
                    <>
                      {upcoming.length > 0 && (
                        <StatusBadge tone="info">
                          <span title={`예정 ${upcoming.length}건`}>예정 {upcoming.length}</span>
                        </StatusBadge>
                      )}
                      {completed.length > 0 && (
                        <StatusBadge tone="gray">
                          <span title={`완료 ${completed.length}건`}>완료 {completed.length}</span>
                        </StatusBadge>
                      )}
                    </>
                  }
                  description={
                    <>
                      <span className="truncate">{r.school ?? "학교 미입력"}</span>
                      <span aria-hidden>·</span>
                      <span>
                        멘토{" "}
                        {r.assignedMentorName ?? <span className="text-fg-warning">미배정</span>}
                      </span>
                    </>
                  }
                  extra={
                    nextSession ? (
                      <span className="inline-flex items-center gap-x1 t3-medium text-fg-informative">
                        <CalendarClock className="size-3.5" aria-hidden />
                        다음{" "}
                        <span className="tabular-nums">
                          {new Date(nextSession.scheduledAt).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                            month: "2-digit",
                            day: "2-digit",
                            weekday: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </PickerList>
        }
        detail={
          <DetailPane>
            {!activeRow ? (
              <DetailPaneEmpty />
            ) : (
              <>
                <DetailPaneHeader
                  title={activeRow.studentName}
                  description={
                    <>
                      <span>{activeRow.grade}</span>
                      {activeRow.school && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{activeRow.school}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span>
                        {activeRow.assignedMentorName
                          ? `담당 멘토 ${activeRow.assignedMentorName}`
                          : "담당 멘토 미배정"}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">총 세션 {activeRow.sessions.length}건</span>
                    </>
                  }
                  actions={
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/online/students/${activeRow.studentId}`} title="이 학생 상세 페이지로 이동">
                        학생 상세
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  }
                />
                <div className="px-x5 py-x5">
                  <MentoringSessionsSection
                    key={activeRow.studentId}
                    studentId={activeRow.studentId}
                    sessions={activeRow.sessions}
                  />
                </div>
              </>
            )}
          </DetailPane>
        }
      />
    </div>
  );
}
