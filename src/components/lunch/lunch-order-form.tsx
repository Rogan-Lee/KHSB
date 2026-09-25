"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Utensils, Check, Clock, Landmark } from "lucide-react";
import {
  IconChevronLeftLine,
  IconChevronRightLine,
  IconPaperplaneLine,
  IconPencilLine,
  IconSquare2StackedLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon, PrefixIcon } from "@seed-design/react";
import {
  submitLunchOrder,
  claimLunchDeposit,
  requestLunchChange,
} from "@/actions/lunch";
import type { LunchFormProps, LunchOrderState, LunchChangeThread } from "@/lib/lunch-data";
import {
  Badge,
  BottomCTA,
  Button,
  EmptyState,
  IconTile,
  Notice,
  Section,
} from "@/components/portal/ui";
import { ActionButton } from "seed-design/ui/action-button";
import { Chip } from "seed-design/ui/chip";
import {
  CheckSelectBox,
  CheckSelectBoxCheckmark,
  CheckSelectBoxGroup,
} from "seed-design/ui/select-box";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import { cn } from "@/lib/utils";

// 학생 포털(/s/[token]/lunch)과 학부모 전용(/meal/[token]) 공용 — 둘 다 모바일, SEED Design.
// /meal 페이지도 루트에 data-portal · --portal-surface 를 지정해 SEED 토큰/폰트와 BottomCTA 배경이 맞는다.

const WON = (n: number) => n.toLocaleString("ko-KR") + "원";

function dateLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function dowOf(ymd: string): number {
  return new Date(ymd + "T00:00:00Z").getUTCDay();
}
function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
// 해당 날짜가 속한 주의 월요일(YYYY-MM-DD). @db.Date(UTC자정)라 UTC 메서드로 KST 달력요일을 읽는다.
function weekStartOf(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}
function weekRangeLabel(monday: string): string {
  const m = new Date(monday + "T00:00:00Z");
  const s = new Date(monday + "T00:00:00Z");
  s.setUTCDate(s.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${f(m)}~${f(s)}`;
}

/**
 * 자유 입력 계좌 문자열("국민 123-45-6789 (홍길동)")을 표시용으로 분해.
 * 숫자 덩어리를 찾지 못하면 null → 원문 그대로 표시.
 */
function parseBankInfo(raw: string): { bank: string; account: string; holder: string } | null {
  const m = raw.match(/\d[\d\s-]{5,}\d/);
  if (!m || m.index == null) return null;
  const bank = raw
    .slice(0, m.index)
    .replace(/[\s:|·,/-]+$/, "")
    .trim();
  const holder = raw
    .slice(m.index + m[0].length)
    .trim()
    .replace(/^[\s:|·,/-]+/, "")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^예금주\s*[:：]?\s*/, "")
    .trim();
  return { bank, account: m[0].trim(), holder };
}

type View = "order" | "payment" | "confirmed";

export function LunchOrderForm(props: LunchFormProps) {
  const { pending, confirmed } = props;
  const derived: View = pending ? "payment" : confirmed ? "confirmed" : "order";
  const [override, setOverride] = useState<View | null>(null);
  const view = override ?? derived;

  return (
    <div className="flex flex-col gap-x3">
      <div className="px-x1 pb-x2 pt-x3">
        <div className="flex items-center gap-x2">
          <h2 className="t8-bold text-fg-neutral">점심 도시락</h2>
          {view === "payment" && pending && (
            <Badge tone="warn" size="md">
              {pending.depositClaimed ? "입금 확인 중" : "입금 대기"}
            </Badge>
          )}
          {view === "confirmed" && <Badge tone="ok" size="md">신청 확정</Badge>}
        </div>
        <p className="mt-x1_5 t5-regular text-fg-neutral-muted">
          {view === "order"
            ? "주차를 고르고 먹을 날짜를 선택해 신청해 주세요."
            : view === "payment"
              ? "아래 계좌로 입금한 뒤 ‘입금했어요’를 눌러 주세요."
              : "신청이 확정됐어요. 내역을 확인해 주세요."}
        </p>
      </div>

      {view === "order" && (
        <OrderView {...props} onSubmitted={() => setOverride(null)} />
      )}
      {view === "payment" && pending && (
        <PaymentView
          token={props.token}
          order={pending}
          bankInfo={props.bankInfo}
          guideText={props.guideText}
          onEdit={() => setOverride("order")}
        />
      )}
      {view === "confirmed" && confirmed && (
        <ConfirmedView
          token={props.token}
          order={confirmed}
          threads={props.changeRequests}
        />
      )}
    </div>
  );
}

// ─────────────────────────── 신청 (달력 + 일괄선택) ───────────────────────────

function OrderView({
  token,
  menus,
  pendingMenuIds,
  pendingMemo,
  paidMenuIds,
  onSubmitted,
}: LunchFormProps & { onSubmitted: () => void }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const paidSet = useMemo(() => new Set(paidMenuIds), [paidMenuIds]);
  // 마감(잠긴) 주의 메뉴 — 신규 신청/변경 불가
  const lockedSet = useMemo(
    () => new Set(menus.filter((m) => m.locked).map((m) => m.id)),
    [menus]
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pendingMenuIds));
  const [memo, setMemo] = useState(pendingMemo);

  // 메뉴가 있는 주(월요일 기준) 목록 — 오름차순
  const weeks = useMemo(() => {
    const set = new Set(menus.map((m) => weekStartOf(m.date)));
    return [...set].sort();
  }, [menus]);

  // 주별 신청 가능 여부 (잠기지 않고 미결제 메뉴가 하나라도 있으면 열림)
  const weekOpen = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const w of weeks) {
      map.set(
        w,
        menus.some((m) => weekStartOf(m.date) === w && !m.locked && !paidSet.has(m.id))
      );
    }
    return map;
  }, [weeks, menus, paidSet]);

  // 초기 주차 = 신청 가능한 첫 주, 없으면 첫 주
  const [weekIdx, setWeekIdx] = useState(() => {
    const i = weeks.findIndex((w) => weekOpen.get(w));
    return i >= 0 ? i : 0;
  });
  const weekStart = weeks[weekIdx];

  const weekMenus = useMemo(
    () =>
      menus
        .filter((m) => weekStartOf(m.date) === weekStart)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [menus, weekStart]
  );
  const weekLocked = weekMenus.length > 0 && weekMenus.every((m) => m.locked);
  const weekSelectable = useMemo(
    () => weekMenus.filter((m) => !paidSet.has(m.id) && !lockedSet.has(m.id)),
    [weekMenus, paidSet, lockedSet]
  );

  const selectedLines = useMemo(
    () => menus.filter((m) => selected.has(m.id)).sort((a, b) => a.date.localeCompare(b.date)),
    [menus, selected]
  );
  const total = selectedLines.reduce((s, m) => s + m.price, 0);

  function bulkAdd(filter: (dow: number) => boolean) {
    setSelected((prev) => new Set([...prev, ...weekSelectable.filter((m) => filter(dowOf(m.date))).map((m) => m.id)]));
  }
  function clearWeek() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of weekSelectable) next.delete(m.id);
      return next;
    });
  }
  function toggle(id: string) {
    if (paidSet.has(id) || lockedSet.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function submit() {
    startTransition(async () => {
      try {
        const res = await submitLunchOrder({ token, menuIds: [...selected], memo });
        toast.success(
          res.count === 0 ? "신청이 취소되었어요" : `${res.count}일 신청 완료`
        );
        onSubmitted();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }

  if (weeks.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Utensils}
          title="아직 신청할 수 있는 메뉴가 없어요"
          description="메뉴가 등록되면 여기에서 신청할 수 있어요."
          className="py-x8"
        />
      </Section>
    );
  }

  return (
    <>
      {/* 주차 선택 — SEED Chip(단일 선택). 초록 점 = 신청 가능한 주 */}
      <section className="rounded-r5 bg-bg-layer-default py-x4">
        <div className="flex items-center justify-between px-x5">
          <p className="t4-bold text-fg-neutral-muted">신청 주차</p>
          <span className="inline-flex items-center gap-x1_5 t2-regular text-fg-neutral-subtle">
            <span className="size-x1_5 rounded-full bg-bg-positive-solid" aria-hidden />
            신청 가능
          </span>
        </div>
        <Chip.RadioRoot
          value={String(weekIdx)}
          onValueChange={(v) => setWeekIdx(Number(v))}
          aria-label="신청 주차"
          className="mt-x3 flex gap-x2 overflow-x-auto px-x5 pb-x0_5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {weeks.map((w, i) => {
            const open = weekOpen.get(w);
            return (
              <Chip.RadioItem key={w} value={String(i)} variant="outlineStrong" size="medium">
                <span aria-hidden className="inline-flex items-center pl-x1_5">
                  <span
                    className={cn(
                      "size-x1_5 rounded-full",
                      open ? "bg-bg-positive-solid" : "bg-fg-placeholder"
                    )}
                  />
                </span>
                <Chip.Label className="tabular-nums">{weekRangeLabel(w)}</Chip.Label>
              </Chip.RadioItem>
            );
          })}
        </Chip.RadioRoot>
      </section>

      {/* 현재 주 헤더 + 상태 + 요일별 선택 */}
      <section className="rounded-r5 bg-bg-layer-default px-x3 pb-x3 pt-x4">
        <div className="flex items-center justify-between">
          <ActionButton
            type="button"
            variant="ghost"
            size="medium"
            layout="iconOnly"
            onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            disabled={weekIdx === 0}
            aria-label="이전 주"
          >
            <Icon svg={<IconChevronLeftLine />} />
          </ActionButton>
          <div className="flex flex-col items-center">
            <p className="t6-bold tabular-nums text-fg-neutral">{weekRangeLabel(weekStart)}</p>
            {weekLocked ? (
              <Badge tone="gray" size="xs" className="mt-x1">
                신청 마감
              </Badge>
            ) : (
              <Badge tone="ok" size="xs" className="mt-x1">
                신청 가능
              </Badge>
            )}
          </div>
          <ActionButton
            type="button"
            variant="ghost"
            size="medium"
            layout="iconOnly"
            onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIdx === weeks.length - 1}
            aria-label="다음 주"
          >
            <Icon svg={<IconChevronRightLine />} />
          </ActionButton>
        </div>

        {/* 이번 주 빠른 선택 — SEED ActionButton xsmall(pill) */}
        {!weekLocked && weekSelectable.length > 0 && (
          <div className="mt-x3 flex flex-wrap justify-center gap-x1_5 px-x1">
            {[
              { label: "이번 주 전체", fn: () => bulkAdd(() => true) },
              { label: "주중", fn: () => bulkAdd((d) => d >= 1 && d <= 5) },
              { label: "주말", fn: () => bulkAdd((d) => d === 0 || d === 6) },
              { label: "해제", fn: clearWeek },
            ].map((b) => (
              <Button key={b.label} variant="gray" size="xs" onClick={b.fn}>
                {b.label}
              </Button>
            ))}
          </div>
        )}

        {/* 요일별 선택 — SEED CheckSelectBox (결제 완료·마감은 disabled) */}
        <CheckSelectBoxGroup
          aria-label={`${weekRangeLabel(weekStart)} 신청 날짜`}
          className="mt-x3"
        >
          {weekMenus.map((menu) => {
            const isPaid = paidSet.has(menu.id);
            const isLocked = lockedSet.has(menu.id);
            const isSel = selected.has(menu.id) || isPaid;
            const disabled = isPaid || isLocked;
            return (
              <CheckSelectBox
                key={menu.id}
                checked={isSel}
                disabled={disabled}
                onCheckedChange={() => toggle(menu.id)}
                label={dateLabel(menu.date)}
                description={<span className="line-clamp-2">{menu.name}</span>}
                suffix={
                  <div className="flex shrink-0 items-center gap-x3">
                    <div className="flex flex-col items-end gap-x1">
                      <span
                        className={cn(
                          "t5-bold tabular-nums",
                          isPaid
                            ? "text-fg-positive"
                            : isSel
                              ? "text-fg-neutral"
                              : "text-fg-neutral-muted"
                        )}
                      >
                        {WON(menu.price)}
                      </span>
                      {isPaid && (
                        <Badge tone="ok" size="xs">
                          결제 완료
                        </Badge>
                      )}
                      {isLocked && !isPaid && (
                        <Badge tone="gray" size="xs">
                          마감
                        </Badge>
                      )}
                    </div>
                    <CheckSelectBoxCheckmark />
                  </div>
                }
              />
            );
          })}
        </CheckSelectBoxGroup>
      </section>

      {/* 선택 요약 (전체 주 통합) */}
      {selectedLines.length > 0 && (
        <Section title={`선택한 날짜 ${selectedLines.length}일`}>
          <ul className="flex flex-col gap-x2_5">
            {selectedLines.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-x3">
                <div className="min-w-0">
                  <p className="t5-medium text-fg-neutral">{dateLabel(m.date)}</p>
                  <p className="mt-x0_5 line-clamp-1 t4-regular text-fg-neutral-subtle">{m.name}</p>
                </div>
                <span className="shrink-0 t5-regular tabular-nums text-fg-neutral-muted">
                  {WON(m.price)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-x4 flex items-center justify-between border-t border-stroke-neutral-subtle pt-x4">
            <span className="t5-medium text-fg-neutral-muted">합계</span>
            <span className="t8-bold tabular-nums text-fg-neutral">{WON(total)}</span>
          </div>
        </Section>
      )}

      <Section>
        <TextField
          label="요청사항"
          indicator="선택"
          value={memo}
          onValueChange={({ slicedValue }) => setMemo(slicedValue)}
          maxGraphemeCount={300}
        >
          <TextFieldTextarea placeholder="알레르기, 수령 관련 등" maxLength={300} />
        </TextField>
      </Section>

      <BottomCTA>
        <Button
          variant={selected.size === 0 ? "gray" : "primary"}
          size="xl"
          block
          loading={busy}
          onClick={submit}
        >
          {selected.size === 0 ? "신청 취소" : `${selected.size}일 · ${WON(total)} 신청하기`}
        </Button>
      </BottomCTA>
    </>
  );
}

// ─────────────────────────── 입금 안내 ───────────────────────────

function OrderSummaryCard({
  order,
  totalLabel,
  footer,
}: {
  order: LunchOrderState;
  totalLabel: string;
  footer?: ReactNode;
}) {
  return (
    <Section title={`신청 내역 ${order.items.length}일`}>
      <ul className="flex flex-col gap-x2">
        {order.items.map((it) => (
          <li key={it.date} className="rounded-r3_5 bg-bg-layer-fill px-x4 py-x3">
            <div className="flex items-baseline justify-between gap-x2">
              <p className="t5-medium text-fg-neutral">{dateLabel(it.date)}</p>
              <span className="shrink-0 t5-medium tabular-nums text-fg-neutral-muted">
                {WON(it.price)}
              </span>
            </div>
            <p className="mt-x1 t4-regular text-fg-neutral-muted">
              {it.name.replace(/,/g, ", ")}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-x4 flex items-center justify-between border-t border-stroke-neutral-subtle pt-x4">
        <span className="t5-medium text-fg-neutral-muted">{totalLabel}</span>
        <span className="t8-bold tabular-nums text-fg-neutral">{WON(order.total)}</span>
      </div>
      {footer != null && <div className="mt-x4">{footer}</div>}
    </Section>
  );
}

function PaymentView({
  token,
  order,
  bankInfo,
  guideText,
  onEdit,
}: {
  token: string;
  order: LunchOrderState;
  bankInfo: string | null;
  guideText: string | null;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const bank = useMemo(() => (bankInfo ? parseBankInfo(bankInfo) : null), [bankInfo]);

  function copyAccount() {
    if (!bankInfo) return;
    navigator.clipboard
      .writeText(bankInfo)
      .then(() => toast.success("계좌번호를 복사했어요"))
      .catch(() => toast.error("복사에 실패했어요"));
  }
  function claim() {
    startTransition(async () => {
      try {
        await claimLunchDeposit(token);
        toast.success("입금 확인 요청을 보냈어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "요청 실패");
      }
    });
  }

  return (
    <>
      {order.depositClaimed && (
        <Notice tone="warn" icon={Clock} title="입금 확인 중이에요">
          관리자가 확인하면 알려드려요. 입금 정보가 다르면 아래에서 다시 알려 주세요.
        </Notice>
      )}

      {/* 송금 카드 — 금액 + 입금 계좌(복사) */}
      <Section>
        <p className="t4-medium text-fg-neutral-muted">입금하실 금액</p>
        <p className="mt-x1 t11-bold tabular-nums text-fg-neutral">{WON(order.total)}</p>
        {bankInfo && (
          <div className="mt-x5 flex items-center gap-x3 rounded-r4 bg-bg-layer-fill py-x3_5 pl-x4 pr-x3">
            <IconTile icon={Landmark} tone="brand" size={40} round />
            <div className="min-w-0 flex-1">
              {bank ? (
                <>
                  <p className="truncate t3-regular text-fg-neutral-subtle">
                    {bank.bank || "입금 계좌"}
                    {bank.holder && ` · ${bank.holder}`}
                  </p>
                  <p className="mt-x0_5 break-all t6-bold tabular-nums text-fg-neutral">
                    {bank.account}
                  </p>
                </>
              ) : (
                <>
                  <p className="t3-regular text-fg-neutral-subtle">입금 계좌</p>
                  <p className="mt-x0_5 break-all t5-bold text-fg-neutral">{bankInfo}</p>
                </>
              )}
            </div>
            <Button variant="weak" size="sm" onClick={copyAccount} className="shrink-0">
              <PrefixIcon svg={<IconSquare2StackedLine />} />
              복사
            </Button>
          </div>
        )}
      </Section>

      <OrderSummaryCard
        order={order}
        totalLabel="합계"
        footer={
          <Button variant="weak" size="lg" block onClick={onEdit}>
            <PrefixIcon svg={<IconPencilLine />} />
            신청 날짜·메뉴 수정하기
          </Button>
        }
      />

      {/* 안내문 (마크다운) */}
      {guideText && (
        <Section title="입금 안내">
          <Markdown>{guideText}</Markdown>
        </Section>
      )}

      {/* 액션 */}
      <BottomCTA>
        {!order.depositClaimed ? (
          <Button variant="primary" size="xl" block loading={busy} onClick={claim}>
            입금했어요
          </Button>
        ) : (
          <Button variant="gray" size="xl" block loading={busy} onClick={claim}>
            다시 알림 보내기
          </Button>
        )}
      </BottomCTA>
    </>
  );
}

// ─────────────────────────── 완료 확인 + 변경요청 ───────────────────────────

function ConfirmedView({
  token,
  order,
  threads,
}: {
  token: string;
  order: LunchOrderState;
  threads: LunchChangeThread[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function sendChange() {
    if (!msg.trim()) return toast.error("변경 요청 내용을 입력해 주세요");
    startTransition(async () => {
      try {
        await requestLunchChange(token, msg);
        toast.success("변경 요청을 보냈어요");
        setMsg("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "요청 실패");
      }
    });
  }

  return (
    <>
      <Section>
        <div className="flex items-center gap-x3_5">
          <IconTile icon={Check} tone="ok" solid size={44} round />
          <div className="min-w-0">
            <p className="t6-bold text-fg-neutral">입금이 확인됐어요</p>
            <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
              신청이 최종 확정됐어요. 감사합니다!
            </p>
          </div>
        </div>
      </Section>

      <OrderSummaryCard order={order} totalLabel="결제 금액" />

      {/* 변경 요청 보내기 */}
      <Section
        title="변경이 필요하신가요?"
        description="날짜·메뉴 변경, 취소 등 요청을 남기면 관리자가 확인 후 처리해 드려요."
      >
        <TextField
          value={msg}
          onValueChange={({ slicedValue }) => setMsg(slicedValue)}
          maxGraphemeCount={500}
        >
          <TextFieldTextarea
            maxLength={500}
            placeholder="예: 7월 15일 신청을 취소하고 싶어요."
            aria-label="변경 요청 내용"
          />
        </TextField>
        <Button
          variant="primary"
          size="lg"
          block
          loading={busy}
          onClick={sendChange}
          className="mt-x3"
        >
          <PrefixIcon svg={<IconPaperplaneLine />} />
          변경 요청 보내기
        </Button>
      </Section>

      {/* 요청 히스토리 (요청 ↔ 반영 답변) */}
      {threads.length > 0 && (
        <Section
          title={
            <>
              변경 요청 내역{" "}
              <span className="tabular-nums text-fg-neutral-subtle">{threads.length}</span>
            </>
          }
        >
          <ul className="flex flex-col gap-x2_5">
            {threads.map((t) => (
              <li key={t.id} className="rounded-r4 bg-bg-layer-fill p-x4">
                <div className="flex items-center justify-between gap-x2">
                  <span className="t3-bold text-fg-neutral-muted">내 요청</span>
                  <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                    {dateTimeLabel(t.createdAt)}
                  </span>
                </div>
                <p className="mt-x1_5 whitespace-pre-wrap t5-regular text-fg-neutral">
                  {t.message}
                </p>
                {t.reply ? (
                  <div className="mt-x3 rounded-r3 bg-bg-layer-default p-x3_5">
                    <div className="flex items-center justify-between gap-x2">
                      <span className="inline-flex items-center gap-x1 t3-bold text-fg-positive">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
                        운영자 반영{t.repliedByName ? ` · ${t.repliedByName}` : ""}
                      </span>
                      {t.repliedAt && (
                        <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                          {dateTimeLabel(t.repliedAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-x1_5 whitespace-pre-wrap t4-regular text-fg-neutral-muted">
                      {t.reply}
                    </p>
                  </div>
                ) : (
                  <Badge tone="warn" className="mt-x3">
                    확인 대기중
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

// ─────────────────────────── 마크다운 ───────────────────────────

function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 t4-regular text-fg-neutral-muted">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="t5-bold text-fg-neutral" {...p} />,
          h2: (p) => <h2 className="t5-bold text-fg-neutral" {...p} />,
          h3: (p) => <h3 className="t4-bold text-fg-neutral" {...p} />,
          p: (p) => <p className="t4-regular" {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-x5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-x5" {...p} />,
          li: (p) => <li className="t4-regular" {...p} />,
          strong: (p) => <strong className="font-bold text-fg-neutral" {...p} />,
          a: (p) => (
            <a className="text-fg-brand-contrast underline" target="_blank" rel="noopener" {...p} />
          ),
          hr: () => <hr className="border-stroke-neutral-subtle" />,
          code: (p) => (
            <code className="rounded-r1 bg-bg-neutral-weak px-x1 py-x0_5 t3-regular" {...p} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
