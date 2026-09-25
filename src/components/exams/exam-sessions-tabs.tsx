"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, TableCard } from "@/components/backoffice/ui";
import { ExamSessionRowActions } from "@/components/exams/exam-session-row-actions";
import { ExamApplicationManager } from "@/components/exams/exam-application-manager";
import type { ExamType } from "@/generated/prisma";

interface SessionRow {
  id: string;
  title: string;
  examDate: string; // ISO yyyy-mm-dd
  examType: ExamType;
  room: string;
  subjects: string[];
  assignmentsCount: number;
  applicationOpen: boolean;
  applicationsCount: number;
  // 평균 백분위 (있을 때만) — 내신 탭에서는 숨김
  averagePercentile: number | null;
}

interface Props {
  sessions: SessionRow[];
}

const TABS: { value: ExamType; label: string }[] = [
  { value: "OFFICIAL_MOCK", label: "모의고사" },
  { value: "PRIVATE_MOCK", label: "학력평가" },
  { value: "DUFF", label: "더프" },
  { value: "SCHOOL_EXAM", label: "내신" },
];

/** "2026-04-10T…" → "2026.04.10" */
function formatDate(iso: string) {
  return iso.slice(0, 10).replaceAll("-", ".");
}

/** 탭 라벨 옆 개수 — 선택된 탭이면 브랜드색 */
function TabCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="t4-bold tabular-nums text-fg-placeholder group-data-[state=active]:text-fg-brand">
      {children}
    </span>
  );
}

export function ExamSessionsTabs({ sessions }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string>("OFFICIAL_MOCK");

  const grouped = useMemo(() => {
    const m: Record<ExamType, SessionRow[]> = {
      OFFICIAL_MOCK: [],
      PRIVATE_MOCK: [],
      DUFF: [],
      SCHOOL_EXAM: [],
    };
    for (const s of sessions) m[s.examType].push(s);
    return m;
  }, [sessions]);

  // 신청 관리 대상 = 학생 신청형(모의고사·학력평가). 내신은 학교 응시라 제외.
  const applicationSessions = useMemo(
    () => sessions.filter((s) => s.examType !== "SCHOOL_EXAM"),
    [sessions]
  );
  const openCount = applicationSessions.filter((s) => s.applicationOpen).length;

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="group">
            {t.label}
            <TabCount>{grouped[t.value].length}</TabCount>
          </TabsTrigger>
        ))}
        <TabsTrigger value="APPLICATIONS" className="group">
          신청 관리
          {openCount > 0 && <TabCount>{openCount}개 접수 중</TabCount>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="APPLICATIONS">
        <ExamApplicationManager sessions={applicationSessions} />
      </TabsContent>

      {TABS.map((t) => {
        const rows = grouped[t.value];
        // 내신 탭은 percentile(백분위) 컬럼 숨김 — 원점수+등급만
        const hidePercentile = t.value === "SCHOOL_EXAM";
        return (
          <TabsContent key={t.value} value={t.value}>
            <TableCard>
              {rows.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={`아직 ${t.label} 세션이 없어요`}
                  description="시험 세션을 만들면 이 목록에 시험일 순으로 쌓여요."
                  action={
                    <Button variant="secondary" asChild>
                      <Link href="/exams/new">
                        <Plus />
                        시험 세션 생성
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">시험일</TableHead>
                      <TableHead>시험명</TableHead>
                      <TableHead>룸</TableHead>
                      <TableHead className="text-right">응시자</TableHead>
                      <TableHead>과목</TableHead>
                      {!hidePercentile && <TableHead className="text-right">평균 백분위</TableHead>}
                      <TableHead className="w-24 text-right">
                        <span className="sr-only">관리</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/exams/${s.id}`)}
                      >
                        <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                          {formatDate(s.examDate)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/exams/${s.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="t4-medium text-fg-neutral hover:underline"
                          >
                            {s.title}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-fg-neutral-muted">{s.room}룸</TableCell>
                        <TableCell className="text-right">{s.assignmentsCount}명</TableCell>
                        <TableCell className="max-w-72 truncate text-fg-neutral-subtle" title={s.subjects.join(", ")}>
                          {s.subjects.join(", ")}
                        </TableCell>
                        {!hidePercentile && (
                          <TableCell className="text-right">
                            {s.averagePercentile != null ? (
                              s.averagePercentile.toFixed(1)
                            ) : (
                              <span className="text-fg-placeholder">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <ExamSessionRowActions sessionId={s.id} title={s.title} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableCard>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
