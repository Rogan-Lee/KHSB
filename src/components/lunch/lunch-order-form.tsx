"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Utensils,
  Check,
  Wallet,
  Copy,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Pencil,
  Send,
  Lock,
} from "lucide-react";
import {
  submitLunchOrder,
  claimLunchDeposit,
  requestLunchChange,
} from "@/actions/lunch";
import type { LunchFormProps, LunchOrderState, LunchChangeThread } from "@/lib/lunch-data";

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

type View = "order" | "payment" | "confirmed";

export function LunchOrderForm(props: LunchFormProps) {
  const { pending, confirmed } = props;
  const derived: View = pending ? "payment" : confirmed ? "confirmed" : "order";
  const [override, setOverride] = useState<View | null>(null);
  const view = override ?? derived;

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] bg-gradient-to-br from-brand to-brand-2 p-5 text-white shadow-md">
        <div className="flex items-center gap-2">
          <Utensils className="h-5 w-5" strokeWidth={2.4} />
          <h2 className="text-[18px] font-bold tracking-[-0.02em]">점심 도시락</h2>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed opacity-95">
          {view === "order"
            ? "주차를 선택해 먹을 날짜를 골라 신청해 주세요."
            : view === "payment"
              ? "아래 계좌로 입금 후 ‘입금했어요’를 눌러 주세요."
              : "신청이 확정되었습니다. 내역을 확인하세요."}
        </p>
      </section>

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
      <section className="rounded-[14px] border border-line bg-panel p-6 text-center text-[13px] text-ink-4">
        아직 신청 가능한 도시락 메뉴가 없어요.
      </section>
    );
  }

  return (
    <>
      {/* 주차 선택 스트립 — 열린 주가 한눈에 (초록 점 = 신청 가능) */}
      <section className="rounded-[14px] border border-line bg-panel p-3">
        <p className="mb-2 text-[11px] font-semibold text-ink-4">신청 주차</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {weeks.map((w, i) => {
            const open = weekOpen.get(w);
            const active = i === weekIdx;
            return (
              <button
                key={w}
                onClick={() => setWeekIdx(i)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  active ? "border-brand bg-brand text-white" : "border-line bg-canvas-2/40 text-ink-2"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    active ? "bg-white" : open ? "bg-ok" : "bg-ink-4/40"
                  }`}
                />
                {weekRangeLabel(w)}
              </button>
            );
          })}
        </div>
      </section>

      {/* 현재 주 헤더 + 상태 + 요일별 카드 */}
      <section className="rounded-[14px] border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            disabled={weekIdx === 0}
            className="rounded-lg p-1.5 text-ink-4 active:bg-canvas-2 disabled:opacity-30"
            aria-label="이전 주"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-[14px] font-bold text-ink">
              <CalendarDays className="h-4 w-4 text-ink-4" />
              {weekRangeLabel(weekStart)}
            </div>
            <span
              className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                weekLocked ? "bg-canvas-2 text-ink-4" : "bg-ok-soft/60 text-ok-ink"
              }`}
            >
              {weekLocked ? (
                <>
                  <Lock className="h-3 w-3" /> 신청 마감
                </>
              ) : (
                "신청 가능"
              )}
            </span>
          </div>
          <button
            onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIdx === weeks.length - 1}
            className="rounded-lg p-1.5 text-ink-4 active:bg-canvas-2 disabled:opacity-30"
            aria-label="다음 주"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 이번 주 빠른 선택 */}
        {!weekLocked && weekSelectable.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[
              { label: "이번 주 전체", fn: () => bulkAdd(() => true) },
              { label: "주중", fn: () => bulkAdd((d) => d >= 1 && d <= 5) },
              { label: "주말", fn: () => bulkAdd((d) => d === 0 || d === 6) },
              { label: "해제", fn: clearWeek },
            ].map((b) => (
              <button
                key={b.label}
                onClick={b.fn}
                className="rounded-full border border-line bg-canvas-2/50 px-3 py-1.5 text-[12px] font-medium text-ink-2 active:bg-canvas-2"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {/* 요일별 큰 카드 리스트 */}
        <ul className="space-y-1.5">
          {weekMenus.map((menu) => {
            const isPaid = paidSet.has(menu.id);
            const isLocked = lockedSet.has(menu.id);
            const isSel = selected.has(menu.id) || isPaid;
            const disabled = isPaid || isLocked;
            const onBrand = isSel && !isPaid;
            return (
              <li key={menu.id}>
                <button
                  disabled={disabled}
                  onClick={() => toggle(menu.id)}
                  className={`flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition-colors ${
                    isPaid
                      ? "border-ok/40 bg-ok-soft/40"
                      : isLocked
                        ? "border-line bg-canvas-2/40"
                        : isSel
                          ? "border-brand bg-brand text-white"
                          : "border-brand/30 bg-brand/5 active:bg-brand/10"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      onBrand
                        ? "border-white bg-white/20"
                        : isPaid
                          ? "border-ok/50 bg-ok/10"
                          : "border-brand/40"
                    }`}
                  >
                    {isSel && <Check className={`h-3.5 w-3.5 ${isPaid ? "text-ok-ink" : "text-white"}`} strokeWidth={3} />}
                    {isLocked && !isSel && <Lock className="h-3 w-3 text-ink-4/60" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] font-semibold ${onBrand ? "text-white" : "text-ink"}`}>
                      {dateLabel(menu.date)}
                    </p>
                    <p className={`truncate text-[12px] ${onBrand ? "text-white/85" : "text-ink-3"}`}>
                      {menu.name}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${onBrand ? "text-white" : "text-ink-2"}`}>
                    {WON(menu.price)}
                  </span>
                  {isPaid && <span className="shrink-0 text-[10px] font-bold text-ok-ink">결제완료</span>}
                  {isLocked && !isPaid && <span className="shrink-0 text-[10px] font-medium text-ink-4">마감</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 선택 요약 (전체 주 통합) */}
      {selectedLines.length > 0 && (
        <section className="rounded-[14px] border border-brand/30 bg-panel p-4">
          <p className="mb-2 text-[12px] font-semibold text-ink-2">
            선택한 날짜 {selectedLines.length}일
          </p>
          <ul className="space-y-1.5">
            {selectedLines.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-[13px]">
                <span className="text-ink">
                  <b className="font-semibold">{dateLabel(m.date)}</b>
                  <span className="ml-1.5 text-ink-3">{m.name}</span>
                </span>
                <span className="tabular-nums text-ink-2">{WON(m.price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
            <span className="text-[13px] font-medium text-ink-3">합계</span>
            <span className="text-[18px] font-bold tabular-nums text-ink">{WON(total)}</span>
          </div>
        </section>
      )}

      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="요청사항 (선택) — 알레르기, 수령 관련 등"
        rows={2}
        maxLength={300}
        className="w-full resize-none rounded-[12px] border border-line bg-panel px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none"
      />

      <button
        onClick={submit}
        disabled={busy}
        className="w-full rounded-[12px] bg-brand px-4 py-3.5 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "처리 중…" : selected.size === 0 ? "신청 취소" : `${selected.size}일 · ${WON(total)} 신청하기`}
      </button>
    </>
  );
}

// ─────────────────────────── 입금 안내 ───────────────────────────

function OrderSummaryCard({ order }: { order: LunchOrderState }) {
  return (
    <section className="rounded-[14px] border border-line bg-panel p-4">
      <p className="mb-2 text-[12px] font-semibold text-ink-2">신청 내역 {order.items.length}일</p>
      <ul className="space-y-1.5">
        {order.items.map((it) => (
          <li key={it.date} className="flex items-center justify-between text-[13px]">
            <span className="text-ink">
              <b className="font-semibold">{dateLabel(it.date)}</b>
              <span className="ml-1.5 text-ink-3">{it.name}</span>
            </span>
            <span className="tabular-nums text-ink-2">{WON(it.price)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[13px] font-medium text-ink-3">입금하실 금액</span>
        <span className="text-[20px] font-bold tabular-nums text-brand">{WON(order.total)}</span>
      </div>
    </section>
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
        <section className="flex items-center gap-2.5 rounded-[14px] border border-warn/30 bg-warn-soft/50 p-4">
          <Clock className="h-5 w-5 shrink-0 text-warn-ink" />
          <p className="text-[13px] text-ink-2">
            <b className="text-warn-ink">입금 확인 대기중</b> — 관리자가 확인하면 알려드려요.
            입금 정보가 다르면 아래에서 다시 알려 주세요.
          </p>
        </section>
      )}

      <OrderSummaryCard order={order} />

      {/* 입금 계좌 (복사) */}
      {bankInfo && (
        <section className="rounded-[14px] border border-brand/30 bg-panel p-4 ring-1 ring-brand/10">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-brand" />
            <p className="text-[12px] font-semibold text-ink-4">입금 계좌</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="flex-1 text-[15px] font-bold text-ink">{bankInfo}</p>
            <button
              onClick={copyAccount}
              className="inline-flex items-center gap-1 rounded-[10px] bg-brand px-3 py-2 text-[12px] font-semibold text-white active:scale-95"
            >
              <Copy className="h-3.5 w-3.5" /> 복사
            </button>
          </div>
        </section>
      )}

      {/* 안내문 (마크다운) */}
      {guideText && (
        <section className="rounded-[14px] border border-line bg-canvas-2/40 p-4">
          <Markdown>{guideText}</Markdown>
        </section>
      )}

      {/* 액션 */}
      {!order.depositClaimed ? (
        <button
          onClick={claim}
          disabled={busy}
          className="w-full rounded-[12px] bg-ok px-4 py-3.5 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "전송 중…" : "입금했어요 — 확인 요청"}
        </button>
      ) : (
        <button
          onClick={claim}
          disabled={busy}
          className="w-full rounded-[12px] border border-line bg-panel px-4 py-3 text-[13px] font-medium text-ink-3 active:bg-canvas-2 disabled:opacity-50"
        >
          다시 알림 보내기
        </button>
      )}
      <button
        onClick={onEdit}
        className="flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-brand/40 bg-brand/5 px-4 py-3 text-[14px] font-semibold text-brand active:bg-brand/10"
      >
        <Pencil className="h-4 w-4" /> 신청 내용 수정하기
      </button>
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
      <section className="flex items-center gap-2.5 rounded-[14px] border border-ok/40 bg-ok-soft/50 p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-ok-ink" />
        <div>
          <p className="text-[15px] font-bold text-ok-ink">입금이 확인되었습니다</p>
          <p className="text-[12.5px] text-ink-3">신청이 최종 확정되었어요. 감사합니다!</p>
        </div>
      </section>

      <OrderSummaryCard order={order} />

      {/* 변경 요청 보내기 */}
      <section className="rounded-[14px] border border-line bg-panel p-4">
        <p className="text-[13px] font-semibold text-ink-2">변경이 필요하신가요?</p>
        <p className="mt-0.5 text-[12px] text-ink-4">
          날짜·메뉴 변경, 취소 등 요청을 남기면 관리자가 확인 후 처리해 드려요.
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="예: 7월 15일 신청을 취소하고 싶어요."
          className="mt-2 w-full resize-none rounded-[10px] border border-line bg-canvas-2/40 px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
        />
        <button
          onClick={sendChange}
          disabled={busy}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-brand px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> 변경 요청 보내기
        </button>
      </section>

      {/* 요청 히스토리 (요청 ↔ 반영 답변) */}
      {threads.length > 0 && (
        <section className="rounded-[14px] border border-line bg-panel p-4">
          <p className="mb-2.5 text-[12px] font-semibold text-ink-2">
            변경 요청 내역 ({threads.length})
          </p>
          <ul className="space-y-3">
            {threads.map((t) => (
              <li key={t.id} className="rounded-[12px] border border-line bg-canvas-2/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-4">내 요청</span>
                  <span className="text-[10.5px] text-ink-4">{dateTimeLabel(t.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{t.message}</p>
                {t.reply ? (
                  <div className="mt-2 rounded-[10px] border border-ok/30 bg-ok-soft/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-ok-ink">
                        운영자 반영 {t.repliedByName ? `· ${t.repliedByName}` : ""}
                      </span>
                      {t.repliedAt && (
                        <span className="text-[10.5px] text-ink-4">{dateTimeLabel(t.repliedAt)}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{t.reply}</p>
                  </div>
                ) : (
                  <p className="mt-2 flex items-center gap-1 text-[11.5px] text-warn-ink">
                    <Clock className="h-3 w-3" /> 확인 대기중
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─────────────────────────── 마크다운 ───────────────────────────

function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-[15px] font-bold text-ink" {...p} />,
          h2: (p) => <h2 className="text-[14px] font-bold text-ink" {...p} />,
          h3: (p) => <h3 className="text-[13px] font-semibold text-ink" {...p} />,
          p: (p) => <p className="text-[13px] leading-relaxed" {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="text-[13px]" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          a: (p) => <a className="text-brand underline" target="_blank" rel="noopener" {...p} />,
          hr: () => <hr className="border-line" />,
          code: (p) => <code className="rounded bg-canvas-2 px-1 py-0.5 text-[12px]" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
