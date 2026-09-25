"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type Props = {
  /** 서버에서 내려준 현재 조회 범위 (URL ?from=&to= 기준) */
  initialFrom: string;
  initialTo: string;
  /** router.push 대상 경로 (예: "/consultations") */
  basePath: string;
  /** from/to 외에 보존할 쿼리 파라미터 (예: { owner: "DIRECTOR" }) */
  extraParams?: Record<string, string>;
  className?: string;
};

/**
 * 리스트 조회용 공용 날짜 범위 툴바.
 * - 시작/종료 DatePicker (staged) + "조회" 버튼으로 URL(?from=&to=) navigate → 서버 재조회.
 * - "오늘만" / "기본 범위" 프리셋. 멘토링 목록과 동일한 패턴.
 */
export function DateRangeToolbar({ initialFrom, initialTo, basePath, extraParams, className }: Props) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [isRefetching, startRefetching] = useTransition();

  // 서버 범위(prop)가 바뀌면 staged 입력을 새 값으로 리셋 — 렌더 중 동기화(effect 불필요).
  const [committed, setCommitted] = useState({ from: initialFrom, to: initialTo });
  if (committed.from !== initialFrom || committed.to !== initialTo) {
    setCommitted({ from: initialFrom, to: initialTo });
    setDateFrom(initialFrom);
    setDateTo(initialTo);
  }

  const datesDirty = dateFrom !== initialFrom || dateTo !== initialTo;

  function applyRange(from: string, to: string) {
    const params = new URLSearchParams();
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v);
      }
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    startRefetching(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  const today = getToday();

  return (
    <div className={cn("flex items-center gap-x2", className)}>
      <span className="t4-medium text-fg-neutral-muted">기간</span>
      <div className="flex items-center gap-x1_5">
        <DatePicker value={dateFrom || null} onChange={(d) => setDateFrom(d ?? "")} placeholder="시작일" />
        <span className="t4-regular text-fg-neutral-subtle" aria-hidden>
          ~
        </span>
        <DatePicker value={dateTo || null} onChange={(d) => setDateTo(d ?? "")} placeholder="종료일" />
      </div>
      <Button
        type="button"
        variant="ink"
        onClick={() => applyRange(dateFrom, dateTo)}
        disabled={isRefetching || !datesDirty}
        title={datesDirty ? "변경된 날짜로 조회" : "현재 범위로 조회 중"}
      >
        {isRefetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {isRefetching ? "조회 중…" : "조회"}
      </Button>
      <div className="flex items-center gap-x1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyRange(today, today)}
          disabled={isRefetching}
        >
          오늘만
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const n = new Date();
            const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            applyRange(iso(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 7)), iso(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 14)));
          }}
          disabled={isRefetching}
        >
          최근 1주일
        </Button>
      </div>
    </div>
  );
}
