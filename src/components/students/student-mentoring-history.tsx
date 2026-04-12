"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, FileText, TrendingUp, AlertCircle, Target, MessageSquare } from "lucide-react";
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

const STATUS_CONFIG = {
  SCHEDULED: { label: "예정", variant: "secondary" as const, color: "text-blue-600" },
  COMPLETED: { label: "완료", variant: "default" as const, color: "text-green-600" },
  CANCELLED: { label: "취소", variant: "outline" as const, color: "text-muted-foreground" },
  RESCHEDULED: { label: "변경", variant: "secondary" as const, color: "text-amber-600" },
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

  return (
    <div className="space-y-4">
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">전체 멘토링</p>
            <p className="text-2xl font-bold">{totalCount}회</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">완료</p>
            <p className="text-2xl font-bold text-green-600">{completedCount}회</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">완료율</p>
            <p className="text-2xl font-bold">
              {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              초기화
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(["ALL", "COMPLETED", "SCHEDULED", "CANCELLED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md font-medium border transition-colors",
                statusFilter === s
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {s === "ALL" ? "전체" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}건</span>
      </div>

      {/* 멘토링 목록 */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border rounded-lg bg-muted/20">
          멘토링 기록이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const isExpanded = expandedId === m.id;
            const hasContent = m.content || m.improvements || m.weaknesses || m.nextGoals || m.notes;
            const status = STATUS_CONFIG[m.status];

            return (
              <div key={m.id} className="border rounded-lg overflow-hidden">
                {/* 헤더 (항상 표시) */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    isExpanded ? "bg-muted/40" : "hover:bg-muted/20",
                    m.status === "CANCELLED" && "opacity-60"
                  )}
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium whitespace-nowrap">{formatDate(m.scheduledAt)}</span>
                    {m.scheduledTimeStart && (
                      <span className="text-xs text-muted-foreground">
                        {m.scheduledTimeStart}{m.scheduledTimeEnd ? `~${m.scheduledTimeEnd}` : ""}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{m.mentor.name}</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {hasContent && m.status === "COMPLETED" && (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                    )}
                  </div>
                  {m.content && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">
                      {m.content}
                    </span>
                  )}
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180"
                  )} />
                </button>

                {/* 확장 영역 */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t bg-muted/10 space-y-3">
                    {!hasContent ? (
                      <p className="text-sm text-muted-foreground py-2">기록된 내용이 없습니다</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {m.content && (
                          <ContentSection
                            icon={<FileText className="h-3.5 w-3.5" />}
                            label="오늘 멘토링 내용"
                            text={m.content}
                          />
                        )}
                        {m.improvements && (
                          <ContentSection
                            icon={<TrendingUp className="h-3.5 w-3.5" />}
                            label="개선된 점"
                            text={m.improvements}
                            color="text-green-600"
                          />
                        )}
                        {m.weaknesses && (
                          <ContentSection
                            icon={<AlertCircle className="h-3.5 w-3.5" />}
                            label="부족한 점"
                            text={m.weaknesses}
                            color="text-red-500"
                          />
                        )}
                        {m.nextGoals && (
                          <ContentSection
                            icon={<Target className="h-3.5 w-3.5" />}
                            label="다음 목표"
                            text={m.nextGoals}
                            color="text-blue-600"
                          />
                        )}
                        {m.notes && (
                          <ContentSection
                            icon={<MessageSquare className="h-3.5 w-3.5" />}
                            label="메모"
                            text={m.notes}
                          />
                        )}
                      </div>
                    )}
                    <div className="flex justify-end pt-1">
                      <Link
                        href={`/mentoring/${m.id}?from=student&studentId=${studentId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        상세 보기 →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
    <div className="space-y-1">
      <div className={cn("flex items-center gap-1.5 text-xs font-medium", color || "text-muted-foreground")}>
        {icon}
        {label}
      </div>
      <div className="pl-5 text-sm">
        <MarkdownViewer source={text} />
      </div>
    </div>
  );
}
