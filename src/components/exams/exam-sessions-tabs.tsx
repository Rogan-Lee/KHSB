"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExamSessionRowActions } from "@/components/exams/exam-session-row-actions";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import type { ExamType } from "@/generated/prisma";

interface SessionRow {
  id: string;
  title: string;
  examDate: string; // ISO yyyy-mm-dd
  examType: ExamType;
  room: string;
  subjects: string[];
  assignmentsCount: number;
  // 평균 백분위 (있을 때만) — 내신 탭에서는 숨김
  averagePercentile: number | null;
}

interface Props {
  sessions: SessionRow[];
}

const TABS: { value: ExamType; label: string }[] = [
  { value: "OFFICIAL_MOCK", label: "모의고사" },
  { value: "PRIVATE_MOCK", label: "학력평가" },
  { value: "SCHOOL_EXAM", label: "내신" },
];

export function ExamSessionsTabs({ sessions }: Props) {
  const [active, setActive] = useState<ExamType>("OFFICIAL_MOCK");

  const grouped = useMemo(() => {
    const m: Record<ExamType, SessionRow[]> = {
      OFFICIAL_MOCK: [],
      PRIVATE_MOCK: [],
      SCHOOL_EXAM: [],
    };
    for (const s of sessions) m[s.examType].push(s);
    return m;
  }, [sessions]);

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as ExamType)} className="w-full">
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
            <span className="ml-1.5 text-[10px] text-muted-foreground">({grouped[t.value].length})</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((t) => {
        const rows = grouped[t.value];
        // 내신 탭은 percentile(백분위) 컬럼 숨김 — 원점수+등급만
        const hidePercentile = t.value === "SCHOOL_EXAM";
        return (
          <TabsContent key={t.value} value={t.value}>
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t.label} 세션이 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시험일</TableHead>
                    <TableHead>시험명</TableHead>
                    <TableHead>종류</TableHead>
                    <TableHead>룸</TableHead>
                    <TableHead>응시자</TableHead>
                    <TableHead>과목</TableHead>
                    {!hidePercentile && <TableHead>평균 백분위</TableHead>}
                    <TableHead className="w-20 text-right">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{s.examDate.slice(0, 10)}</TableCell>
                      <TableCell>
                        <Link href={`/exams/${s.id}`} className="font-medium hover:underline">
                          {s.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{EXAM_TYPE_LABELS[s.examType]}</TableCell>
                      <TableCell className="text-xs">{s.room}룸</TableCell>
                      <TableCell className="text-xs">{s.assignmentsCount}명</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.subjects.join(", ")}</TableCell>
                      {!hidePercentile && (
                        <TableCell className="text-xs tabular-nums">
                          {s.averagePercentile != null ? s.averagePercentile.toFixed(1) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <ExamSessionRowActions sessionId={s.id} title={s.title} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
