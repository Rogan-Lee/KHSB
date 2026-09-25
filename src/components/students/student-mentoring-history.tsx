"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, FileText, TrendingUp, AlertCircle, Target, MessageSquare, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { EmptyState, FilterChip, Section, StatCard, StatCards, StatusBadge, type Tone } from "@/components/backoffice/ui";
import Link from "next/link";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import type { MentoringStatus } from "@/generated/prisma";

type MentoringRecord = {
  id: string;
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: MentoringStatus;
  content: string | null;
  previousIssues: string | null;
  improvements: string | null;
  weaknesses: string | null;
  nextGoals: string | null;
  notes: string | null;
  mentor: { name: string };
};

const STATUS_CONFIG: Record<MentoringStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "예정", tone: "info" },
  COMPLETED: { label: "완료", tone: "ok" },
  CANCELLED: { label: "취소", tone: "gray" },
  RESCHEDULED: { label: "변경", tone: "warn" },
};

export function StudentMentoringHistory({ studentId, mentorings }: { studentId: string; mentorings: MentoringRecord[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<MentoringStatus | "ALL">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = mentorings.filter((m) => {
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    if (dateFrom && new Date(m.scheduledAt) < new Date(dateFrom)) return false;
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      if (new Date(m.scheduledAt) >= to) return false;
    }
    return true;
  });

  const completedCount = mentorings.filter((m) => m.status === "COMPLETED").length;
  const totalCount = mentorings.length;

  const dateInput = cn(inputBaseClass, "h-8 w-auto px-x2 t3-regular");

  return (
    <div className="flex flex-col gap-x4">
      {/* 요약 통계 */}
      <StatCards cols={3} className="grid-cols-3">
        <StatCard label="전체 멘토링" value={totalCount} unit="회" />
        <StatCard label="완료" value={completedCount} unit="회" tone="ok" />
        <StatCard
          label="완료율"
          value={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
          unit="%"
        />
      </StatCards>

      <Section title="멘토링 기록" count={filtered.length || undefined} flush className="overflow-hidden">
        {/* 필터 바 */}
        <div className="flex flex-wrap items-center gap-x2 px-x5 pb-x4">
          <div className="flex items-center gap-x1_5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="시작일"
              className={dateInput}
            />
            <span className="t3-regular text-fg-neutral-subtle">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="종료일"
              className={dateInput}
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="xs" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                초기화
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-x1_5">
            {(["ALL", "COMPLETED", "SCHEDULED", "CANCELLED"] as const).map((st) => (
              <FilterChip key={st} selected={statusFilter === st} onClick={() => setStatusFilter(st)}>
                {st === "ALL" ? "전체" : STATUS_CONFIG[st].label}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* 멘토링 목록 */}
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={NotebookPen}
            title="멘토링 기록이 없어요"
            description={mentorings.length > 0 ? "기간이나 상태 조건을 바꿔 보세요." : undefined}
            className="border-t border-stroke-neutral-muted"
          />
        ) : (
          <ul className="border-t border-stroke-neutral-muted">
            {filtered.map((m) => {
              const isExpanded = expandedId === m.id;
              const hasContent = m.content || m.improvements || m.weaknesses || m.nextGoals || m.notes;
              const status = STATUS_CONFIG[m.status];

              return (
                <li key={m.id} className="border-b border-stroke-neutral-muted last:border-0">
                  {/* 헤더 (항상 표시) */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                    className={cn(
                      "flex w-full items-center gap-x3 px-x5 py-x3_5 text-left transition-colors hover:bg-bg-layer-default-pressed",
                      isExpanded && "bg-bg-layer-fill",
                    )}
                  >
                    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-x3 gap-y-x1", m.status === "CANCELLED" && "opacity-60")}>
                      <span className="whitespace-nowrap t4-medium text-fg-neutral tabular-nums">{formatDate(m.scheduledAt)}</span>
                      {m.scheduledTimeStart && (
                        <span className="t3-regular text-fg-neutral-subtle tabular-nums">
                          {m.scheduledTimeStart}{m.scheduledTimeEnd ? `~${m.scheduledTimeEnd}` : ""}
                        </span>
                      )}
                      <span className="t3-regular text-fg-neutral-muted">{m.mentor.name}</span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      {hasContent && m.status === "COMPLETED" && (
                        <FileText className="size-3.5 text-fg-placeholder" aria-label="기록 있음" />
                      )}
                    </div>
                    {m.content && (
                      <span className="hidden max-w-[240px] truncate t3-regular text-fg-neutral-subtle sm:block">
                        {m.content}
                      </span>
                    )}
                    <ChevronDown
                      className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform duration-200", isExpanded && "rotate-180")}
                      aria-hidden
                    />
                  </button>

                  {/* 확장 영역 */}
                  {isExpanded && (
                    <div className="flex flex-col gap-x4 bg-bg-layer-fill px-x5 pb-x5 pt-x2">
                      {!hasContent ? (
                        <p className="t4-regular text-fg-neutral-subtle">기록된 내용이 없어요</p>
                      ) : (
                        <div className="flex flex-col gap-x4">
                          {m.content && (
                            <ContentSection icon={<FileText className="size-3.5" />} label="오늘 멘토링 내용" text={m.content} />
                          )}
                          {m.improvements && (
                            <ContentSection
                              icon={<TrendingUp className="size-3.5" />}
                              label="개선된 점"
                              text={m.improvements}
                              color="text-fg-positive"
                            />
                          )}
                          {m.weaknesses && (
                            <ContentSection
                              icon={<AlertCircle className="size-3.5" />}
                              label="부족한 점"
                              text={m.weaknesses}
                              color="text-fg-critical"
                            />
                          )}
                          {m.nextGoals && (
                            <ContentSection
                              icon={<Target className="size-3.5" />}
                              label="다음 목표"
                              text={m.nextGoals}
                              color="text-fg-informative"
                            />
                          )}
                          {m.notes && (
                            <ContentSection icon={<MessageSquare className="size-3.5" />} label="메모" text={m.notes} />
                          )}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Link
                          href={`/mentoring/${m.id}?from=student&studentId=${studentId}`}
                          className="inline-flex items-center gap-x0_5 rounded-r2 t3-medium text-fg-neutral-muted transition-colors hover:text-fg-neutral"
                        >
                          상세 보기
                          <ChevronRight className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ContentSection({
  icon,
  label,
  text,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-x1">
      <div className={cn("flex items-center gap-x1_5 t3-bold", color || "text-fg-neutral-muted")}>
        {icon}
        {label}
      </div>
      <div className="pl-x5 t4-regular text-fg-neutral">
        <MarkdownViewer source={text} />
      </div>
    </div>
  );
}
