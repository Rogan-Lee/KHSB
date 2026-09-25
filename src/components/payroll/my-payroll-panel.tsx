"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, LogIn, LogOut, AlertCircle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { clockIn, clockOut } from "@/actions/payroll";
import { EmptyState, Notice, Section, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { WorkTag, PayrollRecord } from "@/generated/prisma";

type Status = { lastTag: WorkTag | null; isWorking: boolean } | null;

// 표시용 시각 — 서버·브라우저 렌더 결과가 같도록 KST 고정
function fmtDateTime(d: Date) {
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
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
  const [clockOutOpen, setClockOutOpen] = useState(false);
  // 경과 시간 기준 시각 — 렌더 중 Date.now() 호출(react-hooks/purity) 대신 마운트·태깅 시점에 갱신
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 진행 중 근무 시간
  const workingMs = status?.isWorking && status.lastTag
    ? nowMs - new Date(status.lastTag.taggedAt).getTime()
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
      const key = new Date(t.taggedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
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
        setNowMs(Date.now());
        toast.success("출근 태깅 완료");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "출근 실패");
      }
    });
  }

  // 확인은 ConfirmDialog 에서 받는다 (window.confirm 대체)
  function handleClockOut() {
    startTransition(async () => {
      try {
        const tag = await clockOut();
        setStatus({ lastTag: tag, isWorking: false });
        setTags((prev) => [tag, ...prev]);
        setNowMs(Date.now());
        setClockOutOpen(false);
        toast.success("퇴근 태깅 완료");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "퇴근 실패");
      }
    });
  }

  const working = !!status?.isWorking;

  return (
    <div className="flex flex-col gap-x6">
      {/* 상단 상태 카드 */}
      <Section>
        <div className="flex flex-col gap-x4 sm:flex-row sm:items-center">
          <span
            aria-hidden
            className={cn(
              "grid size-x14 shrink-0 place-items-center rounded-full",
              working ? "bg-bg-positive-weak text-fg-positive" : "bg-bg-neutral-weak text-fg-neutral-subtle",
            )}
          >
            <Clock className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t3-medium text-fg-neutral-subtle">현재 상태</p>
            <p className={cn("t8-bold", working ? "text-fg-positive" : "text-fg-neutral")}>
              {working ? "근무 중" : "출근 전"}
            </p>
            {working && status?.lastTag && (
              <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                {fmtDateTime(status.lastTag.taggedAt)} 출근 · {fmtDuration(workingMs)} 경과
              </p>
            )}
          </div>
          {!working ? (
            <Button size="lg" onClick={handleClockIn} disabled={pending} className="w-full sm:w-auto">
              <LogIn />
              출근 태깅
            </Button>
          ) : (
            <Button size="lg" onClick={() => setClockOutOpen(true)} disabled={pending} variant="outline" className="w-full sm:w-auto">
              <LogOut />
              퇴근 태깅
            </Button>
          )}
        </div>
      </Section>

      {/* 주의 안내 */}
      <Notice tone="warn" icon={AlertCircle}>
        한 번 태깅한 시각은 본인이 고칠 수 없어요. 실수가 있다면 원장님께 문의해 주세요. 퇴근 태깅 없이 하루를 마치면 원장님께 알림이 가요.
      </Notice>

      {/* 이번 달 정산 (있으면) */}
      {thisMonthRecord && (
        <Section
          title="이번 달 정산"
          description={`${thisMonthRecord.year}년 ${thisMonthRecord.month}월 · 실제 지급 금액은 세금·공제가 반영된 급여명세서를 확인하세요.`}
        >
          <dl className="grid grid-cols-1 gap-x4 sm:grid-cols-3">
            <div>
              <dt className="t3-medium text-fg-neutral-subtle">근무 시간</dt>
              <dd className="mt-x1 t6-bold tabular-nums text-fg-neutral">{minutesToHm(thisMonthRecord.workMinutes)}</dd>
            </div>
            <div>
              <dt className="t3-medium text-fg-neutral-subtle">주휴수당 포함</dt>
              <dd className="mt-x1 t6-bold text-fg-neutral">
                {thisMonthRecord.weeklyHolidayWage > 0 ? "예" : "아니오"}
              </dd>
            </div>
            <div>
              <dt className="t3-medium text-fg-neutral-subtle">마지막 계산</dt>
              <dd className="mt-x1 t6-bold tabular-nums text-fg-neutral">{fmtDateTime(thisMonthRecord.calculatedAt)}</dd>
            </div>
          </dl>
        </Section>
      )}

      {/* 출퇴근 로그 */}
      <Section title="최근 출퇴근 기록" description="최근 3개월" flush>
        {tags.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState
              compact
              icon={CalendarClock}
              title="아직 기록이 없어요"
              description="위 버튼으로 출근 태깅을 시작하세요."
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {groupedTags.map((g) => (
              <div key={g.date} className="border-t border-stroke-neutral-muted">
                <div className="flex items-center justify-between bg-bg-layer-fill px-x5 py-x2 t3-medium text-fg-neutral-muted">
                  <span className="tabular-nums">{g.date}</span>
                  <span className="tabular-nums text-fg-neutral-subtle">{g.tags.length}건</span>
                </div>
                <ul className="flex flex-col">
                  {g.tags.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x2 px-x5 py-x2_5 t4-regular">
                      <StatusBadge tone={t.type === "CLOCK_IN" ? "ok" : "gray"}>
                        {t.type === "CLOCK_IN" ? <LogIn /> : <LogOut />}
                        {t.type === "CLOCK_IN" ? "출근" : "퇴근"}
                      </StatusBadge>
                      <span className="tabular-nums text-fg-neutral">
                        {new Date(t.taggedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      {t.note && (
                        <span className="t3-regular text-fg-neutral-subtle">· {t.note}</span>
                      )}
                      {t.editedByName && (
                        <span className="ml-auto t3-regular text-fg-neutral-subtle">
                          수정됨: {t.editedByName}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={clockOutOpen}
        onOpenChange={setClockOutOpen}
        title="퇴근 태깅을 할까요?"
        description="한 번 태깅한 시각은 본인이 고칠 수 없어요."
        confirmLabel="퇴근 태깅"
        pendingLabel="태깅 중…"
        pending={pending}
        onConfirm={handleClockOut}
      />
    </div>
  );
}
