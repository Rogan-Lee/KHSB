"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, AlertTriangle, UserX, Check, Clock } from "lucide-react";
import { getPatrolRounds, getPatrolRoundDetail, type PatrolRoundSummary, type PatrolRecordView } from "@/actions/patrol";
import type { PatrolStatus } from "@/generated/prisma";

const STATUS_META: Record<PatrolStatus, { label: string; cls: string }> = {
  OK: { label: "양호", cls: "bg-emerald-100 text-emerald-700" },
  NOTE: { label: "특이사항", cls: "bg-amber-100 text-amber-700" },
  ABSENT: { label: "자리비움", cls: "bg-gray-200 text-gray-600" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
}

export function PatrolReview({ initialDate, initialRounds }: { initialDate: string; initialRounds: PatrolRoundSummary[] }) {
  const [date, setDate] = useState(initialDate);
  const [rounds, setRounds] = useState(initialRounds);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PatrolRecordView[]>>({});
  const [pending, startTransition] = useTransition();

  function changeDate(newDate: string) {
    setDate(newDate);
    setExpandedId(null);
    startTransition(async () => {
      try {
        setRounds(await getPatrolRounds(newDate));
      } catch {
        setRounds([]);
      }
    });
  }

  function toggle(roundId: string) {
    if (expandedId === roundId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(roundId);
    if (!details[roundId]) {
      startTransition(async () => {
        const recs = await getPatrolRoundDetail(roundId);
        setDetails((prev) => ({ ...prev, [roundId]: recs }));
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="h-9 w-auto"
        />
        {pending && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            이 날짜에 순찰 기록이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => {
            const isOpen = expandedId === r.id;
            const recs = details[r.id] ?? [];
            return (
              <Card key={r.id}>
                <CardHeader className="cursor-pointer py-3 px-4" onClick={() => toggle(r.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm">
                        {r.label || "순찰 회차"}
                      </CardTitle>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {fmtTime(r.startedAt)}
                        {r.endedAt ? `–${fmtTime(r.endedAt)}` : " (진행 중)"}
                      </span>
                      {r.patrollerName && (
                        <span className="text-xs text-muted-foreground">· {r.patrollerName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />{r.checkedCount}</Badge>
                      {r.noteCount > 0 && <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><AlertTriangle className="h-3 w-3" />{r.noteCount}</Badge>}
                      {r.absentCount > 0 && <Badge variant="outline" className="gap-1"><UserX className="h-3 w-3" />{r.absentCount}</Badge>}
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0 pb-3 border-t">
                    {recs.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">점검 기록이 없습니다</p>
                    ) : (
                      <ul className="divide-y">
                        {recs.map((rec) => (
                          <li key={rec.id} className="flex items-center gap-2 py-2 text-sm">
                            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{rec.seat ?? "—"}</span>
                            <span className="w-20 shrink-0 font-medium">{rec.studentName}</span>
                            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[rec.status].cls}`}>
                              {STATUS_META[rec.status].label}
                            </span>
                            {rec.note && <span className="flex-1 text-xs text-muted-foreground">{rec.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
