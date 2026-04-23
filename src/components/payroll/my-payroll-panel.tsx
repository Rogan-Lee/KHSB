"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, LogIn, LogOut, AlertCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { clockIn, clockOut } from "@/actions/payroll";
import type { WorkTag, PayrollRecord } from "@/generated/prisma";

type Status = { lastTag: WorkTag | null; isWorking: boolean } | null;

function fmtDateTime(d: Date) {
  return new Date(d).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}시간 ${m}분`;
}

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function minutesToHm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}시간 ${m}분`;
}

export function MyPayrollPanel({
  initialStatus,
  initialTags,
  records,
}: {
  initialStatus: Status;
  initialTags: WorkTag[];
  records: PayrollRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [tags, setTags] = useState<WorkTag[]>(initialTags);

  // 진행 중 근무 시간
  const workingMs = status?.isWorking && status.lastTag
    ? Date.now() - new Date(status.lastTag.taggedAt).getTime()
    : 0;

  // 이번 달 정산 (월 레코드에서 찾기)
  const now = new Date();
  const thisMonthRecord = records.find(
    (r) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
  );

  // 태그를 날짜별로 그룹
  const groupedTags = useMemo(() => {
    const map = new Map<string, WorkTag[]>();
    for (const t of tags) {
      const key = new Date(t.taggedAt).toLocaleDateString("ko-KR");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([date, ts]) => ({ date, tags: ts }));
  }, [tags]);

  function handleClockIn() {
    startTransition(async () => {
      try {
        const tag = await clockIn();
        setStatus({ lastTag: tag, isWorking: true });
        setTags((prev) => [tag, ...prev]);
        toast.success("출근 태깅 완료");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "출근 실패");
      }
    });
  }

  function handleClockOut() {
    if (!confirm("퇴근 태깅을 하시겠습니까?")) return;
    startTransition(async () => {
      try {
        const tag = await clockOut();
        setStatus({ lastTag: tag, isWorking: false });
        setTags((prev) => [tag, ...prev]);
        toast.success("퇴근 태깅 완료");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "퇴근 실패");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* 상단 상태 카드 */}
      <div className={cn(
        "rounded-xl border-2 p-5 flex items-center gap-4",
        status?.isWorking
          ? "border-emerald-300 bg-emerald-50"
          : "border-gray-200 bg-gray-50"
      )}>
        <div className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shrink-0",
          status?.isWorking ? "bg-emerald-500" : "bg-gray-400"
        )}>
          <Clock className="h-7 w-7 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">현재 상태</p>
          <p className={cn(
            "text-xl font-bold",
            status?.isWorking ? "text-emerald-700" : "text-gray-700"
          )}>
            {status?.isWorking ? "근무 중" : "출근 전"}
          </p>
          {status?.isWorking && status.lastTag && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtDateTime(status.lastTag.taggedAt)} 출근 · {fmtDuration(workingMs)} 경과
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!status?.isWorking ? (
            <Button size="lg" onClick={handleClockIn} disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">
              <LogIn className="h-4 w-4 mr-2" />
              출근 태깅
            </Button>
          ) : (
            <Button size="lg" onClick={handleClockOut} disabled={pending} variant="outline">
              <LogOut className="h-4 w-4 mr-2" />
              퇴근 태깅
            </Button>
          )}
        </div>
      </div>

      {/* 주의 안내 */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground border-l-2 border-amber-300 pl-3 py-1">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p>
          한 번 태깅한 시각은 본인이 수정할 수 없습니다. 실수가 있다면 원장님께 문의해주세요.
          <br />
          퇴근 태깅 없이 하루를 마치면 원장님께 알림이 갑니다.
        </p>
      </div>

      {/* 이번 달 정산 (있으면) */}
      {thisMonthRecord && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-2">이번 달 정산 ({thisMonthRecord.year}.{String(thisMonthRecord.month).padStart(2, "0")})</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground">근무 시간</p>
              <p className="text-sm font-bold">{minutesToHm(thisMonthRecord.workMinutes)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">주휴수당 포함</p>
              <p className="text-sm font-bold">
                {thisMonthRecord.weeklyHolidayWage > 0 ? "예" : "아니오"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">마지막 계산</p>
              <p className="text-sm font-bold">{fmtDateTime(thisMonthRecord.calculatedAt)}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            ※ 실제 지급 금액은 세금/공제 등이 반영된 급여명세서를 확인하세요.
          </p>
        </div>
      )}

      {/* 출퇴근 로그 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">최근 출퇴근 기록</h3>
          <span className="text-xs text-muted-foreground">(최근 3개월)</span>
        </div>
        {tags.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            아직 기록이 없습니다. 위 버튼으로 출근 태깅을 시작하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {groupedTags.map((g) => (
              <div key={g.date} className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-semibold flex items-center justify-between">
                  <span>{g.date}</span>
                  <span className="text-muted-foreground font-normal">{g.tags.length}개</span>
                </div>
                <div className="divide-y">
                  {g.tags.map((t) => (
                    <div key={t.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                      {t.type === "CLOCK_IN" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <LogIn className="h-3.5 w-3.5" />
                          출근
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                          <LogOut className="h-3.5 w-3.5" />
                          퇴근
                        </span>
                      )}
                      <span className="font-mono text-xs">
                        {new Date(t.taggedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      {t.editedByName && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          수정됨: {t.editedByName}
                        </span>
                      )}
                      {t.note && (
                        <span className="text-xs text-muted-foreground ml-2">· {t.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
