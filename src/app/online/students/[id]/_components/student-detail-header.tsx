// 온라인 학생 상세(개요 + 하위 화면) 공통 머리 — PageHeader + 하위 화면 탭.
// 서버 컴포넌트에서 쓴다(훅 없음).

import type { ReactNode } from "react";
import { LinkTabs, PageHeader, StatusBadge } from "@/components/backoffice/ui";

export type StudentDetailTab =
  | "overview"
  | "survey"
  | "tasks"
  | "progress"
  | "plans"
  | "monthly"
  | "daily-log"
  | "portfolio";

const TABS: { value: StudentDetailTab; label: string; path: string }[] = [
  { value: "overview", label: "개요", path: "" },
  { value: "survey", label: "초기 설문", path: "/survey" },
  { value: "tasks", label: "수행평가", path: "/tasks" },
  { value: "progress", label: "과목별 진도", path: "/progress" },
  { value: "plans", label: "주간 계획", path: "/plans" },
  { value: "monthly", label: "월간 계획", path: "/monthly" },
  { value: "daily-log", label: "카톡 일일 보고", path: "/daily-log" },
  { value: "portfolio", label: "포트폴리오", path: "/portfolio" },
];

const STATUS_META: Record<string, { label: string; tone: "ok" | "gray" | "warn" }> = {
  ACTIVE: { label: "재원", tone: "ok" },
  INACTIVE: { label: "휴원", tone: "warn" },
  GRADUATED: { label: "졸업", tone: "gray" },
  WITHDRAWN: { label: "퇴원", tone: "gray" },
};

export function StudentDetailHeader({
  student,
  current,
  description,
  actions,
  counts,
  showTabs = true,
}: {
  student: { id: string; name: string; status?: string | null };
  current: StudentDetailTab;
  description?: ReactNode;
  actions?: ReactNode;
  /** 탭 옆 숫자 (예: 피드백 대기 수행평가) */
  counts?: Partial<Record<StudentDetailTab, number>>;
  /** 온라인 관리 학생이 아니거나 온라인 직원이 아니면 하위 탭을 숨긴다 */
  showTabs?: boolean;
}) {
  const status = student.status ? STATUS_META[student.status] : undefined;
  const base = `/online/students/${student.id}`;
  return (
    <>
      <PageHeader
        back={{ href: "/online/students", label: "온라인 학생" }}
        title={student.name}
        meta={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        description={description}
        actions={actions}
        className={showTabs ? "mb-x4 md:mb-x5" : undefined}
      />
      {showTabs && (
        <LinkTabs
          className="mb-x6"
          current={current}
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            href: `${base}${t.path}`,
            count: counts?.[t.value],
          }))}
        />
      )}
    </>
  );
}
