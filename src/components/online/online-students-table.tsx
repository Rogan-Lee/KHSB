"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";

export type OnlineStudentRow = {
  id: string;
  studentName: string;
  grade: string;
  school: string | null;
  assignedMentorName: string | null;
  assignedConsultantName: string | null;
  magicLinkExpiresAt: string | null; // ISO
};

export function OnlineStudentsTable({ rows }: { rows: OnlineStudentRow[] }) {
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
            {filtered.length} / {rows.length}명
          </span>
        }
      />

      {filtered.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          조건에 맞는 학생이 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">이름</th>
                <th className="text-left px-3 py-2 font-semibold">학년</th>
                <th className="text-left px-3 py-2 font-semibold">학교</th>
                <th className="text-left px-3 py-2 font-semibold">관리 멘토</th>
                <th className="text-left px-3 py-2 font-semibold">컨설턴트</th>
                <th className="text-left px-3 py-2 font-semibold">매직링크</th>
                <th className="text-right px-3 py-2 font-semibold">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-line hover:bg-canvas-2/50 transition-colors"
                >
                  <td className="px-3 py-2 font-medium text-ink">
                    <Link
                      href={`/online/students/${s.id}`}
                      className="hover:underline"
                    >
                      {s.studentName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-3">{s.grade}</td>
                  <td className="px-3 py-2 text-ink-3">
                    {s.school ?? <span className="text-ink-5">—</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-3">
                    {s.assignedMentorName ?? (
                      <span className="text-ink-5">미배정</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-3">
                    {s.assignedConsultantName ?? (
                      <span className="text-ink-5">미배정</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-3">
                    {s.magicLinkExpiresAt ? (
                      <>~ {new Date(s.magicLinkExpiresAt).toLocaleDateString("ko-KR")}</>
                    ) : (
                      <span className="text-ink-5">없음</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/online/students/${s.id}`}
                        className="inline-flex items-center gap-0.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-3 hover:text-ink hover:border-line-strong"
                        title="담당자·매직링크 등 관리"
                      >
                        <Settings className="h-3 w-3" />
                        관리
                      </Link>
                      <Link
                        href={`/online/students/${s.id}`}
                        className="text-ink-4 hover:text-ink p-1"
                        title="상세 보기"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
