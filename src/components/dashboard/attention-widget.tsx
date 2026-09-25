import { UserCheck } from "lucide-react";
import { EmptyState, ListItem, Section, StatusBadge } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import type { AttentionStudent } from "@/lib/attention";

/**
 * 대시보드 — 유의 관찰 학생 위젯.
 * 수동 플래그 + 자동 판별 결과를 사유와 함께 노출. 목록이 비면 빈 상태를 보여 준다.
 */
export function AttentionWidget({ students }: { students: AttentionStudent[] }) {
  return (
    <Section
      title="유의 관찰 학생"
      count={students.length > 0 ? students.length : undefined}
      description="수동 지정과 최근 출결·과제·상벌점 기록을 바탕으로 골랐어요"
      flush
    >
      {students.length === 0 ? (
        <EmptyState compact icon={UserCheck} title="지금 살펴볼 학생이 없어요" />
      ) : (
        <ul className="max-h-80 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
          {students.map((s) => (
            <li key={s.studentId}>
              <ListItem
                href={`/students/${s.studentId}`}
                leading={
                  <span
                    aria-hidden
                    className={cn(
                      "size-x2 shrink-0 rounded-full",
                      s.severity === "high" ? "bg-bg-critical-solid" : "bg-bg-warning-solid",
                    )}
                  />
                }
                title={
                  <span className="inline-flex items-center gap-x1_5">
                    {s.name}
                    <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                    {s.isManual && <StatusBadge tone="brand">수동</StatusBadge>}
                  </span>
                }
                description={
                  <span className="mt-x0_5 inline-flex items-center gap-x1">
                    {s.reasons.slice(0, 2).map((r, i) => (
                      <StatusBadge
                        key={i}
                        tone={r.kind === "manual" ? "gray" : s.severity === "high" ? "bad" : "warn"}
                      >
                        {r.label}
                      </StatusBadge>
                    ))}
                    {s.reasons.length > 2 && (
                      <span className="t3-regular tabular-nums text-fg-neutral-subtle">+{s.reasons.length - 2}</span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
