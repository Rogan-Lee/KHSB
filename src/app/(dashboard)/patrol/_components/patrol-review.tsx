"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, AlertTriangle, UserX, Check, Clock, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPatrolDayRoundsWithRecords, type PatrolRoundWithRecords } from "@/actions/patrol";
import type { PatrolStatus } from "@/generated/prisma";

const STATUS_META: Record<PatrolStatus, { label: string; cls: string }> = {
  OK: { label: "양호", cls: "bg-emerald-100 text-emerald-700" },
  NOTE: { label: "특이사항", cls: "bg-amber-100 text-amber-700" },
  ABSENT: { label: "자리비움", cls: "bg-gray-200 text-gray-600" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
}

// 근무자(순찰자) 단위로 회차를 묶은 형태
type PatrollerGroup = {
  key: string;
  name: string;
  rounds: PatrolRoundWithRecords[];
  roundCount: number;
  checkedCount: number;
  noteCount: number;
};

function groupByPatroller(rounds: PatrolRoundWithRecords[]): PatrollerGroup[] {
  const map = new Map<string, PatrollerGroup>();
  for (const r of rounds) {
    const key = r.patrollerId ?? r.patrollerName ?? "미지정";
    let g = map.get(key);
    if (!g) {
      g = { key, name: r.patrollerName ?? "미지정", rounds: [], roundCount: 0, checkedCount: 0, noteCount: 0 };
      map.set(key, g);
    }
    g.rounds.push(r);
    g.roundCount += 1;
    g.checkedCount += r.checkedCount;
    g.noteCount += r.noteCount;
  }
  // 특이사항 많은 순 → 점검 많은 순 → 이름순
  return Array.from(map.values()).sort(
    (a, b) => b.noteCount - a.noteCount || b.checkedCount - a.checkedCount || a.name.localeCompare(b.name, "ko"),
  );
}

export function PatrolReview({ initialDate, initialRounds }: { initialDate: string; initialRounds: PatrolRoundWithRecords[] }) {
  const [date, setDate] = useState(initialDate);
  const [rounds, setRounds] = useState(initialRounds);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => groupByPatroller(rounds), [rounds]);
  const selected = useMemo(() => groups.find((g) => g.key === selectedKey) ?? null, [groups, selectedKey]);

  function changeDate(newDate: string) {
    setDate(newDate);
    setSelectedKey(null);
    startTransition(async () => {
      try {
        setRounds(await getPatrolDayRoundsWithRecords(newDate));
      } catch {
        setRounds([]);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => changeDate(e.target.value)} className="h-9 w-auto" />
        {pending && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          순찰자 {groups.length}명 · 회차 {rounds.length}
        </span>
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            이 날짜에 순찰 기록이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 items-start">
          {/* 좌: 근무자(순찰자) 목록 */}
          <aside className={cn("space-y-1.5", selected ? "hidden lg:block" : "block")}>
            {groups.map((g) => {
              const isActive = selectedKey === g.key;
              return (
                <button
                  key={g.key}
                  onClick={() => setSelectedKey(g.key)}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                    isActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{g.name}</span>
                    {g.noteCount > 0 && (
                      <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] h-4 px-1">
                        <AlertTriangle className="h-2.5 w-2.5" />{g.noteCount}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                    {g.roundCount}회차 · 점검 {g.checkedCount}건
                  </p>
                </button>
              );
            })}
          </aside>

          {/* 우: 선택 근무자의 회차 + 기록 */}
          <div className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
            {!selected ? (
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted-foreground">
                  좌측에서 순찰자를 선택하세요.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedKey(null)}
                    className="lg:hidden inline-flex items-center gap-1 text-sm text-muted-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" /> 목록
                  </button>
                  <h3 className="font-bold text-base flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {selected.name}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {selected.roundCount}회차 · 점검 {selected.checkedCount} · 특이 {selected.noteCount}
                  </span>
                </div>

                {selected.rounds.map((r) => (
                  <Card key={r.id}>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap">
                      <span className="font-medium text-sm">{r.label || "순찰 회차"}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {fmtTime(r.startedAt)}{r.endedAt ? `–${fmtTime(r.endedAt)}` : " (진행 중)"}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />{r.checkedCount}</Badge>
                        {r.noteCount > 0 && <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><AlertTriangle className="h-3 w-3" />{r.noteCount}</Badge>}
                        {r.absentCount > 0 && <Badge variant="outline" className="gap-1"><UserX className="h-3 w-3" />{r.absentCount}</Badge>}
                      </div>
                    </div>
                    <CardContent className="py-2">
                      {r.records.length === 0 ? (
                        <p className="py-3 text-center text-xs text-muted-foreground">점검 기록이 없습니다</p>
                      ) : (
                        <ul className="divide-y">
                          {r.records.map((rec) => (
                            <li key={rec.id} className={cn("flex items-center gap-2 py-2 text-sm", rec.status === "NOTE" && "bg-amber-50/60 -mx-2 px-2 rounded")}>
                              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{rec.seat ?? "—"}</span>
                              <span className="w-20 shrink-0 font-medium flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />{rec.studentName}
                              </span>
                              <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[rec.status].cls}`}>
                                {STATUS_META[rec.status].label}
                              </span>
                              {rec.note && <span className="flex-1 text-xs text-foreground/80">{rec.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
