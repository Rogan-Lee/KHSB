"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useSortableTable } from "@/hooks/use-sortable-table";

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

export function MentoringTimeDashboard({ rows }: { rows: MentoringTimeRow[] }) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={mentorId} onValueChange={setMentorId}>
          <SelectTrigger className="w-48">
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
      </div>

      {/* 요약 스탯 */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">총 {withDuration.length}건</Badge>
        <Badge variant="secondary">평균 {avg != null ? `${avg}분` : "—"}</Badge>
        <Badge variant={shortCount > 0 ? "destructive" : "secondary"}>
          {SHORT_THRESHOLD_MIN}분 미만 {shortCount}건
        </Badge>
        <Badge variant="outline">미기록 {unrecorded}건</Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader sortKey="student" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
                학생
              </SortableHeader>
              <SortableHeader sortKey="date" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
                날짜
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">시작</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">완료</th>
              <SortableHeader sortKey="min" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right">
                진행 시간
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  기록이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r) => {
              const isShort = r.min != null && r.min < SHORT_THRESHOLD_MIN;
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/mentoring/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.studentName}</TableCell>
                  <TableCell>
                    {new Date(r.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                  </TableCell>
                  <TableCell>{r.start ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{r.end ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">
                    {r.min == null ? (
                      <span className="text-muted-foreground">미기록</span>
                    ) : isShort ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {r.min}분
                      </Badge>
                    ) : (
                      <span className="font-medium">{r.min}분</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
