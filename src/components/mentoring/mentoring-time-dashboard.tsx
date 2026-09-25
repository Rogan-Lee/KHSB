"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Timer } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { EmptyState, StatCard, StatCards, StatusBadge, TableCard, Toolbar } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { TH_CLASS } from "./mentoring-status";

// ponytail: 15분 하드코딩. 시설별 설정이 필요해지면 상수를 서버 설정으로 옮김.
const SHORT_THRESHOLD_MIN = 15;

export type MentoringTimeRow = {
  id: string;
  studentName: string;
  mentorId: string;
  mentorName: string;
  date: string; // ISO
  start: string | null; // "14:05"
  end: string | null; // "15:10"
  status: string;
};

/** "HH:MM" 두 개로 진행 분을 계산. 값 없음/형식 오류/종료<시작 이면 null. */
export function durationMinutes(start: string | null, end: string | null): number | null {
  const toMin = (t: string | null) => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null) return null;
  const diff = e - s;
  return diff > 0 ? diff : null;
}

export function MentoringTimeDashboard({ rows, filters }: { rows: MentoringTimeRow[]; filters?: ReactNode }) {
  const router = useRouter();
  const [mentorId, setMentorId] = useState("all");

  const mentors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.mentorId, r.mentorName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [rows]);

  const filtered = useMemo(
    () => (mentorId === "all" ? rows : rows.filter((r) => r.mentorId === mentorId)),
    [rows, mentorId]
  );

  // 진행 시간 계산 결과를 붙여둠
  const withDuration = useMemo(
    () => filtered.map((r) => ({ ...r, min: durationMinutes(r.start, r.end) })),
    [filtered]
  );

  const { rows: sorted, sort, toggle } = useSortableTable(withDuration, {
    student: (r) => r.studentName,
    date: (r) => r.date,
    min: (r) => r.min, // null 은 자동으로 뒤로
  });

  // 요약 집계
  const recorded = withDuration.filter((r) => r.min != null);
  const avg = recorded.length
    ? Math.round(recorded.reduce((s, r) => s + (r.min ?? 0), 0) / recorded.length)
    : null;
  const shortCount = recorded.filter((r) => (r.min ?? 0) < SHORT_THRESHOLD_MIN).length;
  const unrecorded = withDuration.length - recorded.length;
  const showMentorCol = mentorId === "all";

  function openDetail(id: string) {
    router.push(`/mentoring/${id}`);
  }

  return (
    <div className="flex flex-col gap-x6">
      <Toolbar className="mb-0">
        <Select value={mentorId} onValueChange={setMentorId}>
          <SelectTrigger className="w-44" aria-label="멘토 선택">
            <SelectValue placeholder="멘토 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 멘토</SelectItem>
            {mentors.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filters}
      </Toolbar>

      {/* 요약 스탯 */}
      <StatCards cols={4}>
        <StatCard label="총 멘토링" value={withDuration.length} unit="건" />
        <StatCard label="평균 진행 시간" value={avg != null ? avg : "—"} unit={avg != null ? "분" : undefined} />
        <StatCard
          label={`${SHORT_THRESHOLD_MIN}분 미만`}
          value={shortCount}
          unit="건"
          tone={shortCount > 0 ? "bad" : "gray"}
          sub="너무 짧게 끝난 세션"
        />
        <StatCard
          label="시간 미기록"
          value={unrecorded}
          unit="건"
          tone={unrecorded > 0 ? "warn" : "gray"}
          sub="시작·종료 시각이 비어 있어요"
        />
      </StatCards>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader sortKey="student" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                학생
              </SortableHeader>
              {showMentorCol && <TableHead>멘토</TableHead>}
              <SortableHeader sortKey="date" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                날짜
              </SortableHeader>
              <TableHead>시작</TableHead>
              <TableHead>완료</TableHead>
              <SortableHeader sortKey="min" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className={cn(TH_CLASS, "text-right")}>
                진행 시간
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={showMentorCol ? 6 : 5} className="p-0">
                  <EmptyState
                    icon={Timer}
                    title="기록된 멘토링이 없어요"
                    description="기간이나 멘토를 바꿔 보세요"
                  />
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r) => {
              const isShort = r.min != null && r.min < SHORT_THRESHOLD_MIN;
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => openDetail(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openDetail(r.id);
                  }}
                >
                  <TableCell className="t4-bold">{r.studentName}</TableCell>
                  {showMentorCol && <TableCell className="text-fg-neutral-muted">{r.mentorName}</TableCell>}
                  <TableCell>
                    {new Date(r.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                  </TableCell>
                  <TableCell>{r.start ?? <span className="text-fg-placeholder">—</span>}</TableCell>
                  <TableCell>{r.end ?? <span className="text-fg-placeholder">—</span>}</TableCell>
                  <TableCell className="text-right">
                    {r.min == null ? (
                      <span className="text-fg-neutral-subtle">미기록</span>
                    ) : isShort ? (
                      <StatusBadge tone="bad">
                        <AlertTriangle />
                        {r.min}분
                      </StatusBadge>
                    ) : (
                      <span className="t4-medium">{r.min}분</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
