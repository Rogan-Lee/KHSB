"use client";

import { useState, useTransition } from "react";
import { getMentoringMatches, type MatchCandidate } from "@/actions/mentoring";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StatusBadge } from "@/components/backoffice/ui";
import { Clock, Users, Zap } from "lucide-react";
import Link from "next/link";
import { PRIORITY } from "./mentoring-status";

interface Props {
  mentorId: string;
  today: string;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: "우선 1순위",
  2: "우선 2순위",
  3: "일반",
};

export function MatchingPanel({ mentorId, today }: Props) {
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function runMatching() {
    startTransition(async () => {
      const result = await getMentoringMatches(mentorId, today);
      setCandidates(result);
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      <div className="flex flex-wrap items-center justify-between gap-x3">
        <div>
          <p className="t5-bold text-fg-neutral">오늘의 매칭 추천</p>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{today} 기준 지금 재실 중인 원생</p>
        </div>
        <Button size="sm" variant="outline" onClick={runMatching} disabled={isPending}>
          <Zap />
          {isPending ? "조회 중…" : "매칭 조회"}
        </Button>
      </div>

      {candidates === null && (
        <p className="py-x4 text-center t3-regular text-fg-neutral-subtle">
          매칭 조회를 누르면 지금 재실 중인 원생을 우선순위대로 추천해요.
        </p>
      )}

      {candidates !== null && candidates.length === 0 && (
        <EmptyState compact icon={Users} title="지금 재실 중인 원생이 없어요" />
      )}

      {candidates && candidates.length > 0 && (
        <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>순위</TableHead>
                <TableHead>원생</TableHead>
                <TableHead>담당</TableHead>
                <TableHead>마지막 멘토링</TableHead>
                <TableHead>주의사항</TableHead>
                <TableHead><span className="sr-only">작업</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c, idx) => (
                <TableRow key={c.studentId}>
                  <TableCell>
                    <div className="flex items-center gap-x2">
                      <span className="w-4 t3-bold tabular-nums text-fg-neutral-subtle">{idx + 1}</span>
                      <StatusBadge tone={PRIORITY[c.priority].tone}>{PRIORITY_LABEL[c.priority]}</StatusBadge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="t4-bold">{c.studentName}</span>
                    <span className="ml-x1 t3-regular text-fg-neutral-subtle">{c.grade}</span>
                  </TableCell>
                  <TableCell>
                    {c.isAssignedMentor ? (
                      <StatusBadge tone="brand">담당</StatusBadge>
                    ) : (
                      <span className="t3-regular text-fg-neutral-subtle">타멘토</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.lastMentoringDate ? (
                      <span className="inline-flex items-center gap-x1 t3-regular">
                        <Clock className="size-3.5 text-fg-neutral-subtle" aria-hidden />
                        {new Date(c.lastMentoringDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        <span className="text-fg-neutral-subtle">({c.daysSinceLast}일 전)</span>
                      </span>
                    ) : (
                      <span className="t3-bold text-fg-critical">이력 없음</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate t3-regular text-fg-neutral-subtle">
                    {c.mentoringNotes || "—"}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="xs" variant="outline">
                      <Link href={`/mentoring/new?studentId=${c.studentId}`}>시작</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
