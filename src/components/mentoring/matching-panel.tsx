"use client";

import { useState, useTransition } from "react";
import { getMentoringMatches, type MatchCandidate } from "@/actions/mentoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Zap, User, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Props {
  mentorId: string;
  today: string;
}

const PRIORITY_BADGE: Record<number, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-orange-100 text-orange-800 border-orange-200",
  3: "bg-blue-100 text-blue-800 border-blue-200",
};

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">오늘의 매칭 추천</span>
          <span className="text-xs text-muted-foreground">{today} 기준 현재 재실 중인 학생</span>
        </div>
        <Button size="sm" variant="outline" onClick={runMatching} disabled={isPending}>
          {isPending ? "조회 중..." : "매칭 조회"}
        </Button>
      </div>

      {candidates === null && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          매칭 조회 버튼을 클릭하면 현재 재실 중인 학생을 우선순위에 따라 추천합니다.
        </p>
      )}

      {candidates !== null && candidates.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <AlertCircle className="h-4 w-4" />
          현재 재실 중인 학생이 없습니다.
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left">순위</th>
                <th className="px-3 py-2 text-left">원생</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">담당</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">마지막 멘토링</th>
                <th className="px-3 py-2 text-left">주의사항</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, idx) => (
                <tr
                  key={c.studentId}
                  className={cn(
                    "border-b last:border-0",
                    idx === 0 ? "bg-yellow-50/50" : ""
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-muted-foreground w-4">{idx + 1}</span>
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", PRIORITY_BADGE[c.priority])}>
                        {PRIORITY_LABEL[c.priority]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{c.studentName}</span>
                    <span className="text-xs text-muted-foreground ml-1">{c.grade}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.isAssignedMentor ? (
                      <Badge variant="default" className="text-xs"><User className="h-3 w-3 mr-1" />담당</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">타멘토</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.lastMentoringDate ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{new Date(c.lastMentoringDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                        <span className="text-muted-foreground">({c.daysSinceLast}일 전)</span>
                      </div>
                    ) : (
                      <span className="text-xs text-red-600 font-medium">이력 없음</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[180px] truncate">
                    {c.mentoringNotes || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/mentoring/new?studentId=${c.studentId}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs">시작</Button>
                    </Link>
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
