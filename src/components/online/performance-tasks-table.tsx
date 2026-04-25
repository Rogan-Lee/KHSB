"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import type { PerformanceTaskStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_COLORS: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-amber-100 text-amber-800",
  NEEDS_REVISION: "bg-red-100 text-red-800",
  DONE: "bg-emerald-100 text-emerald-800",
};

export type PerformanceTaskRow = {
  id: string;
  subject: string;
  title: string;
  dueDate: string; // ISO
  status: PerformanceTaskStatus;
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  latestSubmissionVersion: number | null;
  latestSubmissionFeedbackCount: number;
};

export function PerformanceTasksTable({ rows }: { rows: PerformanceTaskRow[] }) {
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => matchesStudentFilter(r, filter)),
    [rows, filter]
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
            {filtered.length} / {rows.length}건
          </span>
        }
      />

      {filtered.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          조건에 맞는 수행평가가 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">학생</th>
                <th className="text-left px-3 py-2 font-semibold">학교</th>
                <th className="text-left px-3 py-2 font-semibold">과목</th>
                <th className="text-left px-3 py-2 font-semibold">제목</th>
                <th className="text-left px-3 py-2 font-semibold">마감일</th>
                <th className="text-left px-3 py-2 font-semibold">상태</th>
                <th className="text-left px-3 py-2 font-semibold">피드백</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const due = new Date(t.dueDate);
                const daysLeft = Math.ceil(
                  (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const dueClass =
                  daysLeft < 0
                    ? "text-red-700 font-semibold"
                    : daysLeft <= 1
                      ? "text-amber-700 font-semibold"
                      : daysLeft <= 3
                        ? "text-amber-600"
                        : "text-ink-3";
                const hasSubmission = t.latestSubmissionVersion != null;
                const hasFeedback = t.latestSubmissionFeedbackCount > 0;
                return (
                  <tr
                    key={t.id}
                    className="border-t border-line hover:bg-canvas-2/50 transition-colors"
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/online/students/${t.studentId}/tasks`}
                        className="hover:underline"
                      >
                        {t.studentName}
                      </Link>
                      <span className="ml-1 text-[11px] text-ink-5">({t.grade})</span>
                    </td>
                    <td className="px-3 py-2 text-ink-3">
                      {t.school ?? <span className="text-ink-5">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-3">{t.subject}</td>
                    <td className="px-3 py-2 text-ink">
                      <Link
                        href={`/online/students/${t.studentId}/tasks/${t.id}`}
                        className="hover:underline"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${dueClass}`}>
                      {due.toLocaleDateString("ko-KR")}
                      <span className="ml-1 text-[11px]">
                        {daysLeft < 0
                          ? `D+${-daysLeft}`
                          : daysLeft === 0
                            ? "D-Day"
                            : `D-${daysLeft}`}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium ${STATUS_COLORS[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {hasSubmission && !hasFeedback ? (
                        <Link
                          href={`/online/students/${t.studentId}/tasks/${t.id}#feedback-v${t.latestSubmissionVersion}`}
                          className="inline-flex items-center gap-1 rounded-[6px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-200"
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                          작성 필요
                        </Link>
                      ) : hasFeedback ? (
                        <span className="inline-flex items-center gap-1 rounded-[6px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">
                          <MessageSquare className="h-3 w-3" />
                          작성됨
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-5">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
