"use client";

// 한눈에 보기 탭 (원장급) — 월별 청구·수납, 이달 청구서, 발행해야 할 청구서, 미납 경과일, 납부 시점 이력, 최근 활동.
// 색은 dataviz 검사(라이트·다크 모두)를 통과한 SEED 토큰만 쓴다:
//  · 월별 추이 = 강조형 — 수납 brand(carrot-600), 청구는 맥락이라 회색(gray-600). 회색은 대비가 낮아 표 보기를 함께 둔다
//  · 납부 시점 = 상태 두 가지 — 기한 내 green-600, 늦게·미납 bg-critical-solid (빨강·노랑은 색각 이상에서 겹쳐 두 가지로 줄임)
//  · 미납 경과일 = 순서형 한 색 단계 — red-500 → red-800
// 값·이름 글자는 차트 색이 아니라 글자 토큰을 쓴다.

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Section, Segmented, StatusBadge, type Tone } from "@/components/backoffice/ui";
import type { TuitionDashboard } from "@/lib/tuition/admin-data";
import { parseDateKey } from "@/lib/tuition/calc";
import { won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import { shortDateTime, StudentCell } from "./shared";

const seed = (token: string) => `var(--seed-color-${token})`;
const C = {
  billed: seed("palette-gray-600"),
  received: seed("palette-carrot-600"),
  onTime: seed("palette-green-600"),
  lateOrUnpaid: seed("bg-critical-solid"),
  meterTrack: seed("palette-green-200"),
  schedule: seed("palette-carrot-600"),
  grid: seed("stroke-neutral-muted"),
  tick: seed("fg-neutral-subtle"),
  surface: seed("bg-layer-default"),
  cursor: seed("bg-layer-fill"),
};
const AGING_COLORS = [seed("palette-red-500"), seed("palette-red-600"), seed("palette-red-700"), seed("palette-red-800")];

const TICK = { fontSize: 12, fill: C.tick };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 축 눈금 — 만 원 단위 (3,600,000 → 360만) */
function manWon(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;
function dayLabel(key: string): string {
  const d = parseDateKey(key);
  return d ? `${d.getUTCMonth() + 1}.${d.getUTCDate()} (${WEEKDAY[d.getUTCDay()]})` : key;
}

/** 범례 한 줄 — 막대는 네모 키 */
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x4 t3-regular text-fg-neutral-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-x1_5">
          <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** 툴팁 — 값이 먼저, 이름은 흐리게, 계열은 짧은 선 키 */
function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-r3 bg-bg-layer-floating px-x3 py-x2_5 shadow-s2">
      <p className="t3-bold text-fg-neutral">{title}</p>
      <div className="mt-x1 flex flex-col gap-x0_5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-x2 t3-regular">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color ?? "transparent" }} aria-hidden />
            <span className="t3-bold tabular-nums text-fg-neutral">{row.value}</span>
            <span className="text-fg-neutral-subtle">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type View = "chart" | "table";
function ViewToggle({ value, onChange, label }: { value: View; onChange: (v: View) => void; label: string }) {
  return (
    <Segmented
      aria-label={`${label} 보기 방식`}
      value={value}
      onChange={onChange}
      className="w-auto"
      options={[
        { value: "chart", label: "그래프" },
        { value: "table", label: "표" },
      ]}
    />
  );
}

function Figure({ value, unit, sub }: { value: string; unit?: string; sub?: ReactNode }) {
  return (
    <div>
      <p className="t8-bold text-fg-neutral">
        {value}
        {unit && <span className="ml-x0_5 t5-medium text-fg-neutral-muted">{unit}</span>}
      </p>
      {sub && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{sub}</p>}
    </div>
  );
}

function GoTo({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="xs" onClick={onClick}>
      {children}
      <ArrowRight />
    </Button>
  );
}

// ─── 월별 청구·수납 ─────────────────────────────────────────────────────

function TrendCard({ months }: { months: TuitionDashboard["months"] }) {
  const [view, setView] = useState<View>("chart");
  const data = months.map((m) => ({ ...m, label: monthLabel(m.ym) }));
  const empty = months.every((m) => m.billed === 0 && m.received === 0);
  return (
    <Section
      title="월별 청구·수납"
      description={`납부 기한 기준 최근 ${months.length}개월이에요. 회색은 청구한 금액, 주황은 실제로 받은 금액이에요.`}
      actions={<ViewToggle value={view} onChange={setView} label="월별 청구·수납" />}
      className="lg:col-span-2"
    >
      {empty ? (
        <EmptyState compact icon={History} title="아직 청구 기록이 없어요" />
      ) : view === "chart" ? (
        <div className="flex flex-col gap-x3">
          <Legend
            items={[
              { label: "청구", color: C.billed },
              { label: "수납", color: C.received },
            ]}
          />
          <div role="img" aria-label={`최근 ${months.length}개월 청구와 수납 금액 막대 그래프 — 표 보기에서 숫자를 볼 수 있어요`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={manWon} width={64} />
                <Tooltip
                  cursor={{ fill: C.cursor }}
                  content={({ active, payload }) => {
                    const m = active && payload?.[0] ? (payload[0].payload as (typeof data)[number]) : null;
                    if (!m) return null;
                    return (
                      <TooltipCard
                        title={`${monthLabel(m.ym)} 납부 기한`}
                        rows={[
                          { label: "수납", value: won(m.received), color: C.received },
                          { label: "청구", value: won(m.billed), color: C.billed },
                          { label: "미납", value: won(m.unpaidAmount) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="billed" name="청구" fill={C.billed} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="received" name="수납" fill={C.received} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>달</TableHead>
              <TableHead className="text-right">청구</TableHead>
              <TableHead className="text-right">수납</TableHead>
              <TableHead className="text-right">미납</TableHead>
              <TableHead className="text-right">수납률</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => (
              <TableRow key={m.ym}>
                <TableCell>{m.ym.replace("-", ".")}</TableCell>
                <TableCell className="text-right tabular-nums">{won(m.billed)}</TableCell>
                <TableCell className="text-right tabular-nums">{won(m.received)}</TableCell>
                <TableCell className="text-right tabular-nums">{won(m.unpaidAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.billed > 0 ? `${Math.round((m.received / m.billed) * 100)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

// ─── 이달 청구서 ───────────────────────────────────────────────────────

function IssuedCard({
  issued,
  ym,
  onGoTo,
}: {
  issued: TuitionDashboard["issued"];
  ym: string;
  onGoTo: () => void;
}) {
  const rate = issued.amount > 0 ? Math.min(100, Math.round((issued.paidAmount / issued.amount) * 100)) : 0;
  const rows: { label: string; count: number; tone: Tone }[] = [
    { label: "납부 완료", count: issued.paid, tone: "ok" },
    { label: "결제 요청", count: issued.requested, tone: "gray" },
    { label: "연체", count: issued.overdue, tone: "bad" },
    { label: "환불", count: issued.refunded, tone: "gray" },
  ];
  return (
    <Section
      title={`${monthLabel(ym)} 청구서`}
      description="납부 기한이 이달인 청구서예요."
      actions={<GoTo onClick={onGoTo}>청구·수납</GoTo>}
    >
      <div className="flex flex-col gap-x4">
        <Figure
          value={issued.total.toLocaleString("ko-KR")}
          unit="건"
          sub={`${won(issued.amount)} · 자동 발행 ${issued.auto}건 · 직접 발행 ${issued.manual}건`}
        />
        <div>
          <div className="flex items-baseline justify-between t3-regular text-fg-neutral-muted">
            <span>받은 금액 {won(issued.paidAmount)}</span>
            <span className="t4-bold text-fg-neutral">{rate}%</span>
          </div>
          <div
            className="mt-x1_5 h-2 overflow-hidden rounded-full"
            style={{ background: C.meterTrack }}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={rate}
            aria-label="이달 청구 금액 중 받은 비율"
          >
            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: C.onTime }} />
          </div>
        </div>
        <ul className="flex flex-wrap gap-x2">
          {rows.map((row) => (
            <li key={row.label} className="inline-flex items-center gap-x1_5 t3-regular text-fg-neutral-muted">
              <StatusBadge tone={row.tone}>{row.label}</StatusBadge>
              <span className="t4-bold tabular-nums text-fg-neutral">{row.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// ─── 발행해야 할 청구서 ─────────────────────────────────────────────────

function ToIssueCard({
  dueNow,
  attention,
  days,
  autoIssueEnabled,
  onGoTo,
}: {
  dueNow: TuitionDashboard["dueNow"];
  attention: TuitionDashboard["attention"];
  days: TuitionDashboard["days"];
  autoIssueEnabled: boolean;
  onGoTo: () => void;
}) {
  const shown = days.slice(0, 6);
  const max = Math.max(1, ...shown.map((day) => day.amount));
  return (
    <Section
      title="발행해야 할 청구서"
      description={autoIssueEnabled ? "확인 필요가 아닌 학생은 발행일 오전 10시에 자동으로 나가요." : "자동 청구가 꺼져 있어 직접 발행해야 해요."}
      actions={<GoTo onClick={onGoTo}>청구 일정</GoTo>}
    >
      <div className="flex flex-col gap-x4">
        <Figure
          value={dueNow.count.toLocaleString("ko-KR")}
          unit="명"
          sub={dueNow.count > 0 ? `오늘까지 발행일이 된 청구 ${won(dueNow.amount)}` : "오늘 발행할 청구는 없어요"}
        />
        {attention.length > 0 && (
          <div className="flex flex-wrap items-center gap-x2">
            <span className="t3-medium text-fg-neutral">확인 필요</span>
            {attention.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-x1 t3-regular">
                <StatusBadge tone={item.label === "청구 시작일 필요" || item.label === "보류" ? "warn" : "bad"}>
                  {item.label}
                </StatusBadge>
                <span className="t4-bold tabular-nums text-fg-neutral">{item.count}</span>
              </span>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <p className="t3-regular text-fg-neutral-subtle">앞으로 한 달 안에 발행할 청구가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-x2" aria-label="날짜별 발행 예정">
            {shown.map((day) => (
              <li key={day.date} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-x3">
                <span className="t3-medium tabular-nums text-fg-neutral">{dayLabel(day.date)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-bg-layer-fill" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(day.amount / max) * 100}%`, background: C.schedule }}
                  />
                </span>
                <span className="whitespace-nowrap text-right t3-regular tabular-nums text-fg-neutral-muted">
                  {day.count}명 · {won(day.amount)}
                  {day.attention > 0 && <span className="ml-x1 text-fg-critical">(확인 필요 {day.attention})</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// ─── 미납 ──────────────────────────────────────────────────────────────

function UnpaidCard({
  aging,
  topOverdue,
  today,
  onOpenInvoice,
  onGoTo,
}: {
  aging: TuitionDashboard["aging"];
  topOverdue: TuitionDashboard["topOverdue"];
  today: string;
  onOpenInvoice: (invoiceId: string) => void;
  onGoTo: () => void;
}) {
  const total = aging.reduce((sum, bucket) => sum + bucket.amount, 0);
  const count = aging.reduce((sum, bucket) => sum + bucket.count, 0);
  const max = Math.max(1, ...aging.map((bucket) => bucket.count));
  const todayDate = parseDateKey(today) as Date;
  return (
    <Section
      title="미납"
      description="납부 기한이 지난 청구서를 지난 날짜별로 나눴어요."
      actions={<GoTo onClick={onGoTo}>독촉하기</GoTo>}
    >
      <div className="flex flex-col gap-x4">
        <Figure value={count.toLocaleString("ko-KR")} unit="건" sub={count > 0 ? `못 받은 금액 ${won(total)}` : "밀린 청구서가 없어요"} />
        <ul className="flex flex-col gap-x2" aria-label="미납 경과일 구간">
          {aging.map((bucket, index) => (
            <li key={bucket.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x3">
              <span className="t3-medium text-fg-neutral">{bucket.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-bg-layer-fill" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(bucket.count / max) * 100}%`, background: AGING_COLORS[index] }}
                />
              </span>
              <span className="whitespace-nowrap text-right t3-regular tabular-nums text-fg-neutral-muted">
                {bucket.count}건 · {won(bucket.amount)}
              </span>
            </li>
          ))}
        </ul>
        {topOverdue.length > 0 && (
          <div>
            <p className="mb-x2 t3-medium text-fg-neutral">오래 밀린 청구서</p>
            <ul className="flex flex-col divide-y divide-stroke-neutral-muted">
              {topOverdue.map((row) => {
                const due = parseDateKey(row.dueDate) as Date;
                const days = Math.round((todayDate.getTime() - due.getTime()) / 86_400_000);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(row.id)}
                      className="flex w-full items-center gap-x3 py-x2 text-left hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <StudentCell student={row.student} />
                        <span className="block truncate t3-regular text-fg-neutral-subtle">
                          {row.title} · 안내 {row.noticeCount}회
                          {row.lastNotice && ` · 마지막 ${shortDateTime(row.lastNotice.createdAt)}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block t4-bold tabular-nums text-fg-neutral">{won(row.amount)}</span>
                        <StatusBadge tone="bad">{days}일 지남</StatusBadge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── 납부 시점 이력 ─────────────────────────────────────────────────────

function TimingCard({ months }: { months: TuitionDashboard["months"] }) {
  const [view, setView] = useState<View>("chart");
  const data = months.map((m) => ({ ...m, label: monthLabel(m.ym), lateOrUnpaid: m.late + m.unpaid }));
  const empty = months.every((m) => m.onTime + m.late + m.unpaid === 0);
  return (
    <Section
      title="납부 시점 이력"
      description={`최근 ${months.length}개월 청구서를 납부 기한 안에 냈는지 건수로 봐요.`}
      actions={<ViewToggle value={view} onChange={setView} label="납부 시점 이력" />}
    >
      {empty ? (
        <EmptyState compact icon={History} title="아직 납부 기록이 없어요" />
      ) : view === "chart" ? (
        <div className="flex flex-col gap-x3">
          <Legend
            items={[
              { label: "기한 내 납부", color: C.onTime },
              { label: "늦게 납부·미납", color: C.lateOrUnpaid },
            ]}
          />
          <div role="img" aria-label="최근 몇 달 기한 내 납부와 늦게 납부·미납 건수 누적 막대 그래프 — 표 보기에서 숫자를 볼 수 있어요">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} barCategoryGap="35%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip
                  cursor={{ fill: C.cursor }}
                  content={({ active, payload }) => {
                    const m = active && payload?.[0] ? (payload[0].payload as (typeof data)[number]) : null;
                    if (!m) return null;
                    return (
                      <TooltipCard
                        title={`${monthLabel(m.ym)} 납부 기한`}
                        rows={[
                          { label: "기한 내 납부", value: `${m.onTime}건`, color: C.onTime },
                          { label: "늦게 납부", value: `${m.late}건`, color: C.lateOrUnpaid },
                          { label: "아직 미납", value: `${m.unpaid}건`, color: C.lateOrUnpaid },
                        ]}
                      />
                    );
                  }}
                />
                {/* 쌓인 칸 사이는 바탕색 2px 틈으로 나눈다 */}
                <Bar dataKey="onTime" stackId="t" fill={C.onTime} stroke={C.surface} strokeWidth={2} maxBarSize={24} />
                <Bar
                  dataKey="lateOrUnpaid"
                  stackId="t"
                  fill={C.lateOrUnpaid}
                  stroke={C.surface}
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>달</TableHead>
              <TableHead className="text-right">기한 내</TableHead>
              <TableHead className="text-right">늦게 납부</TableHead>
              <TableHead className="text-right">아직 미납</TableHead>
              <TableHead className="text-right">기한 내 비율</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => {
              const all = m.onTime + m.late + m.unpaid;
              return (
                <TableRow key={m.ym}>
                  <TableCell>{m.ym.replace("-", ".")}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.onTime}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.late}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.unpaid}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {all > 0 ? `${Math.round((m.onTime / all) * 100)}%` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

// ─── 최근 활동 ─────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  STAFF: "운영진",
  PARENT: "학부모",
  WEBHOOK: "결제사",
  SYNC: "결제사 확인",
  CRON: "자동",
  SYSTEM: "자동",
};

function ActivityCard({ activity }: { activity: TuitionDashboard["activity"] }) {
  return (
    <Section title="최근 활동" description="발행·납부·환불·안내 기록이에요." className="lg:col-span-2" flush>
      {activity.length === 0 ? (
        <EmptyState compact icon={History} title="아직 기록이 없어요" />
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
          {activity.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline gap-x3 px-x6 py-x3">
              <span className="w-24 shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">{shortDateTime(event.createdAt)}</span>
              <StatusBadge tone="gray">{event.label}</StatusBadge>
              <span className="t4-medium text-fg-neutral">{event.studentName ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate t3-regular text-fg-neutral-muted">{event.detail}</span>
              <span className="t3-regular text-fg-neutral-subtle">{event.actorName ?? SOURCE_LABEL[event.source] ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function OverviewTab({
  dashboard,
  ym,
  today,
  autoIssueEnabled,
  onGoToTab,
  onOpenInvoice,
}: {
  dashboard: TuitionDashboard;
  ym: string;
  today: string;
  autoIssueEnabled: boolean;
  onGoToTab: (tab: "invoices" | "billing") => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-x4 lg:grid-cols-2")}>
      <TrendCard months={dashboard.months} />
      <IssuedCard issued={dashboard.issued} ym={ym} onGoTo={() => onGoToTab("invoices")} />
      <ToIssueCard
        dueNow={dashboard.dueNow}
        attention={dashboard.attention}
        days={dashboard.days}
        autoIssueEnabled={autoIssueEnabled}
        onGoTo={() => onGoToTab("billing")}
      />
      <UnpaidCard
        aging={dashboard.aging}
        topOverdue={dashboard.topOverdue}
        today={today}
        onOpenInvoice={onOpenInvoice}
        onGoTo={() => onGoToTab("billing")}
      />
      <TimingCard months={dashboard.months} />
      <ActivityCard activity={dashboard.activity} />
    </div>
  );
}
