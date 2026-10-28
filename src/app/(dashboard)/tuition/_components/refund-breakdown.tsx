"use client";

// 환불 계산 과정 — suggestRefund 가 낸 줄(구간)마다 며칠 이용했는지, 어느 구간인지, 어떤 식으로 계산했는지 보여 준다.
// 환불 다이얼로그(와 이후 퇴원 정산)가 같이 쓴다. 금액은 화면 계산이고, 확정·한도 검증은 서버가 다시 한다.

import type { RefundLine, RefundSuggestion, TuitionRefundPolicyValue } from "@/lib/tuition/calc";
import { dotDate, REFUND_POLICY_LABEL, won } from "@/lib/tuition/format";
import { dateKey } from "@/lib/tuition/calc";
import { cn } from "@/lib/utils";
import { shortPeriod } from "./shared";

const RULE_TEXT: Record<RefundLine["rule"], string> = {
  FULL: "시작 전 — 전액",
  TWO_THIRDS: "1/3 경과 전 — 납부액의 2/3",
  HALF: "1/3 경과 후 ~ 1/2 경과 전 — 납부액의 1/2",
  NONE: "1/2 경과 후 — 반환 없음",
  DAILY: "남은 일수만큼 일할",
};

const pct = (used: number, total: number) => Math.round((used / total) * 100);

/** 1/3 · 1/2 경계와 이용한 만큼을 막대로 — 지금 들어간 구간을 진하게 */
function BracketBar({ line }: { line: RefundLine }) {
  const used = Math.min(100, (line.usedDays / line.totalDays) * 100);
  const zones = [
    { from: 0, to: 100 / 3, label: "2/3 반환", rule: "TWO_THIRDS", tone: "bg-bg-positive-weak", on: "bg-bg-positive-solid" },
    { from: 100 / 3, to: 50, label: "1/2", rule: "HALF", tone: "bg-bg-warning-weak", on: "bg-bg-warning-solid" },
    { from: 50, to: 100, label: "반환 없음", rule: "NONE", tone: "bg-bg-neutral-weak", on: "bg-bg-neutral-solid-muted" },
  ] as const;
  return (
    <div className="mt-x2" aria-hidden>
      <div className="relative h-2 overflow-hidden rounded-full">
        {zones.map((zone) => (
          <div
            key={zone.rule}
            className={cn("absolute inset-y-0", line.rule === zone.rule ? zone.on : zone.tone)}
            style={{ left: `${zone.from}%`, width: `${zone.to - zone.from}%` }}
          />
        ))}
      </div>
      <div className="relative h-x5">
        {/* 마지막 이용일 위치 */}
        <span
          className="absolute top-0 -translate-x-1/2 t2-bold text-fg-neutral"
          style={{ left: `${Math.max(2, Math.min(98, used))}%` }}
        >
          ▲
        </span>
      </div>
      <div className="flex t2-regular text-fg-neutral-subtle">
        {zones.map((zone) => (
          <span
            key={zone.rule}
            className={cn("text-center", line.rule === zone.rule && "t2-bold text-fg-neutral")}
            style={{ width: `${zone.to - zone.from}%` }}
          >
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineDetail({ line, roundUnit }: { line: RefundLine; roundUnit: number }) {
  const rounded = Math.floor(line.raw) !== line.amount;
  const roundText = roundUnit >= 1000 ? "천 원 미만 절사" : `${roundUnit}원 미만 절사`;
  const formula = (expr: string) => (
    <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-muted">
      {expr} = {won(Math.floor(line.raw))}
      {rounded && ` → ${roundText} ${won(line.amount)}`}
    </p>
  );

  if (line.rule === "FULL") {
    return <p className="mt-x1 t3-regular text-fg-neutral-muted">이용 시작 전이라 이 기간 몫 {won(line.share)} 전액</p>;
  }
  if (line.rule === "DAILY") {
    const left = line.totalDays - line.usedDays;
    return (
      <>
        <p className="mt-x1 t3-regular text-fg-neutral-muted">
          {line.totalDays}일 중 {line.usedDays}일 이용 · 남은 {left}일
        </p>
        {formula(`${won(line.share)} × ${left}일 ÷ ${line.totalDays}일`)}
      </>
    );
  }
  if (line.usedDays >= line.totalDays) {
    return <p className="mt-x1 t3-regular text-fg-neutral-muted">다 이용한 기간이라 반환 없음</p>;
  }
  return (
    <>
      <p className="mt-x1 t3-regular text-fg-neutral-muted">
        {line.totalDays}일 중 {line.usedDays}일 이용 ({pct(line.usedDays, line.totalDays)}% 경과) → {RULE_TEXT[line.rule]}
      </p>
      <BracketBar line={line} />
      {line.rule === "TWO_THIRDS" && formula(`${won(line.share)} × 2/3`)}
      {line.rule === "HALF" && formula(`${won(line.share)} × 1/2`)}
    </>
  );
}

export function RefundBreakdown({
  suggestion,
  policy,
  returnBy,
}: {
  suggestion: RefundSuggestion;
  policy: TuitionRefundPolicyValue;
  /** 규정상 돌려줘야 하는 날 (반환 사유 발생일 + 5일). 없으면 안 보여 준다 */
  returnBy: Date | null;
}) {
  if (suggestion.lines.length === 0) return null;
  return (
    <section
      aria-label="환불 계산 과정"
      className="rounded-r3 px-x4 py-x3 shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)]"
    >
      <div className="flex items-baseline justify-between gap-x2">
        <h3 className="t4-bold text-fg-neutral">계산 과정</h3>
        <span className="t3-regular text-fg-neutral-subtle">{REFUND_POLICY_LABEL[policy]}</span>
      </div>

      <ol className="mt-x3 flex flex-col divide-y divide-stroke-neutral-muted">
        {suggestion.lines.map((line) => (
          <li key={dateKey(line.start)} className="py-x3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-x3">
              <p className="t4-medium text-fg-neutral">
                {line.label && <span className="mr-x1_5">{line.label}</span>}
                <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                  {shortPeriod(dateKey(line.start), dateKey(line.end))} · {line.totalDays}일
                </span>
              </p>
              <span className="whitespace-nowrap t4-bold tabular-nums text-fg-neutral">{won(line.amount)}</span>
            </div>
            <LineDetail line={line} roundUnit={suggestion.roundUnit} />
          </li>
        ))}
      </ol>

      <div className="mt-x3 flex items-baseline justify-between border-t border-stroke-neutral-muted pt-x3">
        <span className="t4-medium text-fg-neutral">제안 금액</span>
        <span className="t5-bold tabular-nums text-fg-neutral">{won(suggestion.amount)}</span>
      </div>
      {suggestion.cappedFrom !== null && (
        <p className="mt-x1 t3-regular text-fg-neutral-subtle">
          계산 합계 {won(suggestion.cappedFrom)} 중 환불 가능 금액까지만 제안해요.
        </p>
      )}
      {returnBy && suggestion.amount > 0 && (
        <p className="mt-x1 t3-regular text-fg-neutral-subtle">
          규정상 반환 사유 발생일로부터 5일 이내, {dotDate(dateKey(returnBy))}까지 돌려드려야 해요.
        </p>
      )}
    </section>
  );
}
