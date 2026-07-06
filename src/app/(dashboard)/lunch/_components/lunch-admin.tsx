"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Utensils,
  Wallet,
  Trash2,
  Check,
  Truck,
  Package,
  ChevronLeft,
  ChevronRight,
  Send,
  LinkIcon,
} from "lucide-react";
import { shiftMonth, formatYearMonth } from "@/lib/online/month";
import {
  createLunchMenu,
  updateLunchMenu,
  deleteLunchMenu,
  bulkConfirmPayment,
  deleteLunchOrder,
  revertPayment,
  setItemReceived,
  updateLunchSetting,
  issueLunchParentLinks,
  replyLunchChangeRequest,
} from "@/actions/lunch";

type Menu = {
  id: string;
  date: string;
  name: string;
  price: number;
  buffer: number;
  closed: boolean;
};
type Item = {
  id: string;
  menuId: string;
  date: string;
  name: string;
  price: number;
  received: boolean;
};
type Order = {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  parentPhone: string;
  paidStatus: "PENDING" | "PAID";
  memo: string | null;
  depositClaimed: boolean;
  items: Item[];
};
type StudentLite = {
  id: string;
  name: string;
  grade: string;
  parentPhone: string;
  token: string | null;
};
type ChangeReq = {
  id: string;
  studentName: string;
  grade: string;
  message: string;
  reply: string | null;
  repliedByName: string | null;
  createdAt: string;
  repliedAt: string | null;
};

const WON = (n: number) => n.toLocaleString("ko-KR") + "원";

function dateLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
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

type Tab = "menu" | "orders" | "links" | "requests" | "distribute" | "settings";

// 날짜별 신청 수량(결제완료/미결제) 맵
function useQtyByMenu(orders: Order[]) {
  return useMemo(() => {
    const m = new Map<string, { paid: number; pending: number }>();
    for (const o of orders) {
      for (const it of o.items) {
        const cur = m.get(it.menuId) ?? { paid: 0, pending: 0 };
        if (o.paidStatus === "PAID") cur.paid++;
        else cur.pending++;
        m.set(it.menuId, cur);
      }
    }
    return m;
  }, [orders]);
}

export function LunchAdmin({
  ym,
  canIssueLinks,
  menus,
  orders,
  students,
  changeRequests,
  bankInfo,
  guideText,
}: {
  ym: string;
  canIssueLinks: boolean;
  menus: Menu[];
  orders: Order[];
  students: StudentLite[];
  changeRequests: ChangeReq[];
  bankInfo: string;
  guideText: string;
}) {
  const [tab, setTab] = useState<Tab>("menu");
  const pendingCount = orders.filter((o) => o.paidStatus === "PENDING").length;
  const openRequestCount = changeRequests.filter((c) => !c.reply).length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "menu", label: "메뉴·발주(달력)" },
    { key: "orders", label: "신청·입금", badge: pendingCount },
    { key: "links", label: "학부모 링크" },
    { key: "requests", label: "변경요청", badge: openRequestCount },
    { key: "distribute", label: "배부" },
    { key: "settings", label: "설정" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Utensils className="h-5 w-5 text-brand" />
        <h1 className="text-lg font-bold">점심 도시락</h1>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-brand text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "menu" && <CalendarMenuTab ym={ym} menus={menus} orders={orders} />}
      {tab === "orders" && <OrdersTab orders={orders} />}
      {tab === "links" && (
        <LinksTab students={students} canIssue={canIssueLinks} orders={orders} />
      )}
      {tab === "requests" && <RequestsTab requests={changeRequests} />}
      {tab === "distribute" && <DistributeTab menus={menus} orders={orders} />}
      {tab === "settings" && <SettingsTab bankInfo={bankInfo} guideText={guideText} />}
    </div>
  );
}

// ─────────────────────────── 메뉴 · 발주 (달력) ───────────────────────────

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function CalendarMenuTab({
  ym,
  menus,
  orders,
}: {
  ym: string;
  menus: Menu[];
  orders: Order[];
}) {
  const qtyByMenu = useQtyByMenu(orders);
  const [editDate, setEditDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, Menu>();
    for (const menu of menus) if (menu.date.startsWith(ym)) m.set(menu.date, menu);
    return m;
  }, [menus, ym]);

  const [y, mo] = ym.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
  ];

  // 이번 달 발주 합계 (결제완료 + 여유분)
  const monthMenus = [...byDate.values()];
  const totalQty = monthMenus.reduce(
    (s, m) => s + (qtyByMenu.get(m.id)?.paid ?? 0) + m.buffer,
    0
  );
  const totalCost = monthMenus.reduce(
    (s, m) => s + ((qtyByMenu.get(m.id)?.paid ?? 0) + m.buffer) * m.price,
    0
  );

  return (
    <div className="space-y-3">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between rounded-md border border-line bg-muted/40 px-3 py-2">
        <Link
          href={`/lunch?ym=${shiftMonth(ym, -1)}`}
          className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
          title="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold tabular-nums">{formatYearMonth(ym)}</span>
        <Link
          href={`/lunch?ym=${shiftMonth(ym, 1)}`}
          className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
          title="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 편집 바 (선택된 날짜) */}
      {editDate && (
        <DayEditor
          key={editDate}
          date={editDate}
          menu={byDate.get(editDate) ?? null}
          onClose={() => setEditDate(null)}
          onSavedNext={(next) => setEditDate(next)}
        />
      )}

      {/* 달력 그리드 */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-muted/50 text-center text-[11px] font-medium text-muted-foreground">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((dateStr, idx) => {
            if (!dateStr)
              return <div key={idx} className="min-h-[76px] border-b border-r border-line bg-muted/20" />;
            const menu = byDate.get(dateStr);
            const q = menu ? qtyByMenu.get(menu.id) : undefined;
            const day = Number(dateStr.slice(-2));
            const dow = (firstDow + day - 1) % 7;
            const active = editDate === dateStr;
            return (
              <button
                key={idx}
                onClick={() => setEditDate(dateStr)}
                className={`min-h-[76px] border-b border-r border-line p-1.5 text-left align-top transition-colors hover:bg-brand/5 ${
                  active ? "bg-brand/10 ring-1 ring-inset ring-brand" : ""
                } ${menu?.closed ? "opacity-60" : ""}`}
              >
                <span
                  className={`text-[11px] font-semibold ${
                    dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-foreground"
                  }`}
                >
                  {day}
                </span>
                {menu ? (
                  <div className="mt-0.5 space-y-0.5">
                    <p className="truncate text-[11px] font-medium leading-tight text-foreground">
                      {menu.name}
                    </p>
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {WON(menu.price)}
                    </p>
                    {q && q.paid + q.pending > 0 && (
                      <p className="text-[10px] tabular-nums">
                        <span className="text-emerald-600">{q.paid}</span>
                        {q.pending > 0 && <span className="text-amber-600"> +{q.pending}</span>}
                        <span className="text-muted-foreground">건</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground/60">+ 메뉴</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 이번 달 발주 요약 */}
      <div className="flex items-center gap-4 rounded-lg border border-line bg-muted/30 px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Truck className="h-4 w-4" /> {formatYearMonth(ym)} 발주
        </span>
        <span className="ml-auto tabular-nums">
          총 <b>{totalQty}</b>개 · <b>{WON(totalCost)}</b>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        날짜를 눌러 메뉴·가격·여유분을 입력하세요. 발주수량 = 결제완료 + 여유분. 셀의{" "}
        <span className="text-emerald-600">초록</span>=결제완료,{" "}
        <span className="text-amber-600">주황</span>=미입금 건수.
      </p>
    </div>
  );
}

function DayEditor({
  date,
  menu,
  onClose,
  onSavedNext,
}: {
  date: string;
  menu: Menu | null;
  onClose: () => void;
  onSavedNext: (next: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(menu?.name ?? "");
  const [price, setPrice] = useState(menu ? String(menu.price) : "");
  const [buffer, setBuffer] = useState(menu ? String(menu.buffer) : "0");

  function nextDate(): string {
    const dt = new Date(date + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  }

  function save() {
    const p = Number(price);
    if (!name.trim()) return toast.error("메뉴명을 입력하세요");
    if (!Number.isFinite(p) || p < 0) return toast.error("가격을 확인하세요");
    startTransition(async () => {
      try {
        await createLunchMenu({ date, name, price: p, buffer: Number(buffer) || 0 });
        toast.success(`${dateLabel(date)} 저장`);
        router.refresh();
        onSavedNext(nextDate()); // 다음 날로 이동해 연속 입력
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }
  function remove() {
    if (!menu) return onClose();
    startTransition(async () => {
      try {
        await deleteLunchMenu(menu.id);
        toast.success("삭제되었어요");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-brand/40 bg-brand/5 p-3">
      <span className="flex flex-col gap-1 text-xs text-muted-foreground">
        날짜
        <span className="px-1 py-1.5 text-sm font-semibold text-foreground">{dateLabel(date)}</span>
      </span>
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        메뉴명
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="예: 제육덮밥"
          className="rounded-md border border-line bg-background px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        가격(원)
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="6000"
          className="w-24 rounded-md border border-line bg-background px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        여유분(선택)
        <input
          type="number"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          placeholder="0"
          title="비워두면 0. 학부모 신청/선택과는 무관합니다."
          className="w-16 rounded-md border border-line bg-background px-2 py-1.5 text-sm"
        />
      </label>
      <button
        onClick={save}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        저장 →
      </button>
      {menu && (
        <>
          <label
            className="flex items-center gap-1 px-1 py-2 text-xs text-muted-foreground"
            title="마감 시 학부모 신규 신청 차단"
          >
            <input
              type="checkbox"
              defaultChecked={menu.closed}
              disabled={pending}
              onChange={(e) => {
                startTransition(async () => {
                  await updateLunchMenu({ id: menu.id, closed: e.target.checked });
                  router.refresh();
                });
              }}
              className="rounded accent-brand"
            />
            마감
          </label>
          <button
            onClick={remove}
            disabled={pending}
            className="rounded-md border border-line px-2 py-2 text-muted-foreground hover:text-red-600"
            title="삭제 (신청 없는 메뉴만)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
      <button
        onClick={onClose}
        className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        닫기
      </button>
    </div>
  );
}

// ─────────────────────────── 신청 · 입금 ───────────────────────────

function OrdersTab({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = onlyUnpaid ? orders.filter((o) => o.paidStatus === "PENDING") : orders;
  const selectablePending = rows.filter((o) => o.paidStatus === "PENDING");
  const allSelected =
    selectablePending.length > 0 && selectablePending.every((o) => selected.has(o.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectablePending.map((o) => o.id)));
  }
  function confirmSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkConfirmPayment(ids);
        toast.success(`${res.count}건 입금 확인 완료`);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }
  function revert(id: string) {
    startTransition(async () => {
      try {
        await revertPayment(id);
        toast.success("입금 확인을 취소했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }
  function remove(o: Order) {
    if (!confirm(`${o.studentName} 학생의 신청(${o.items.length}일)을 삭제할까요? 되돌릴 수 없습니다.`))
      return;
    startTransition(async () => {
      try {
        await deleteLunchOrder(o.id);
        toast.success("신청을 삭제했어요");
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(o.id);
          return next;
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }
  const orderTotal = (o: Order) => o.items.reduce((s, it) => s + it.price, 0);
  const claimedCount = orders.filter(
    (o) => o.paidStatus === "PENDING" && o.depositClaimed
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          총 <b className="text-foreground">{orders.length}</b>건 · 미입금{" "}
          <b className="text-amber-600">
            {orders.filter((o) => o.paidStatus === "PENDING").length}
          </b>
          {claimedCount > 0 && (
            <>
              {" "}
              · 입금알림 <b className="text-emerald-600">{claimedCount}</b>
            </>
          )}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded accent-brand"
          />
          미입금 전체선택
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyUnpaid}
            onChange={(e) => setOnlyUnpaid(e.target.checked)}
            className="rounded accent-brand"
          />
          미입금만
        </label>
        <button
          onClick={confirmSelected}
          disabled={pending || selected.size === 0}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> 선택 {selected.size}건 입금확인
        </button>
      </div>

      <div className="divide-y divide-line rounded-lg border border-line">
        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">신청 내역이 없습니다.</p>
        )}
        {rows.map((o) => {
          const paid = o.paidStatus === "PAID";
          return (
            <div key={o.id} className="flex items-start gap-3 px-3 py-2.5">
              {!paid ? (
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  className="mt-1 rounded accent-brand"
                />
              ) : (
                <span className="mt-1 h-4 w-4" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.studentName}</span>
                  <span className="text-xs text-muted-foreground">{o.grade}</span>
                  <span className="text-xs text-muted-foreground">{o.parentPhone}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {paid ? "입금확인" : "미입금"}
                  </span>
                  {!paid && o.depositClaimed && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800">
                      💰 입금했다고 알림
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {o.items
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((it) => `${dateLabel(it.date)} ${it.name}`)
                    .join(" · ")}{" "}
                  ({o.items.length}일)
                </p>
                {o.memo && <p className="mt-0.5 text-xs text-ink-3">📝 {o.memo}</p>}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <p className="font-semibold tabular-nums">{WON(orderTotal(o))}</p>
                <div className="flex items-center gap-2">
                  {paid && (
                    <button
                      onClick={() => revert(o.id)}
                      disabled={pending}
                      className="text-[11px] text-muted-foreground hover:text-red-600"
                    >
                      확인취소
                    </button>
                  )}
                  <button
                    onClick={() => remove(o)}
                    disabled={pending}
                    title="신청 삭제(취소)"
                    className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── 학부모 링크 (일괄 발급·복사) ───────────────────────────

function LinksTab({
  students,
  canIssue,
  orders,
}: {
  students: StudentLite[];
  canIssue: boolean;
  orders: Order[];
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 이미 신청한 학생 표시용
  const orderedIds = useMemo(
    () => new Set(orders.map((o) => o.studentId)),
    [orders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q)
    );
  }, [students, query]);

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((s) => s.id)));
  }

  // 선택 학생 링크 생성(없으면 발급) 후 클립보드로 일괄 복사
  function copySelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const links = await issueLunchParentLinks(ids);
        const lines = links.map(
          (l) => `${l.name} ${l.grade} — ${origin}/meal/${l.token}`
        );
        await navigator.clipboard.writeText(lines.join("\n"));
        toast.success(`${links.length}명 링크 복사됨 — 학부모께 전달하세요`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "링크 생성 실패");
      }
    });
  }

  async function copyOne(s: StudentLite) {
    const origin = window.location.origin;
    let token = s.token;
    if (!token) {
      if (!canIssue) return toast.error("링크 발급 권한이 없습니다 (원장/관리자)");
      const [issued] = await issueLunchParentLinks([s.id]);
      token = issued?.token ?? null;
    }
    if (!token) return;
    await navigator.clipboard.writeText(`${origin}/meal/${token}`);
    toast.success(`${s.name} 링크 복사됨`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·학년 검색"
          className="rounded-md border border-line bg-background px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded accent-brand"
          />
          전체선택 ({filtered.length})
        </label>
        <button
          onClick={copySelected}
          disabled={pending || selected.size === 0 || !canIssue}
          title={!canIssue ? "링크 발급은 원장/관리자만" : undefined}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-background px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> 선택 {selected.size}명 링크 복사
        </button>
      </div>
      {!canIssue && (
        <p className="text-xs text-amber-600">
          링크 신규 발급은 원장/관리자 권한이 필요합니다. 기존 링크 복사는 가능합니다.
        </p>
      )}

      <div className="divide-y divide-line rounded-lg border border-line">
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">학생이 없습니다.</p>
        )}
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="rounded accent-brand"
            />
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.grade}</span>
            {orderedIds.has(s.id) && (
              <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                신청함
              </span>
            )}
            <span
              className={`text-[10px] ${s.token ? "text-emerald-600" : "text-muted-foreground/60"}`}
            >
              {s.token ? "링크 있음" : "링크 없음"}
            </span>
            <button
              onClick={() => copyOne(s)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-3.5 w-3.5" /> 복사
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── 변경 요청 (히스토리 + 반영 답변) ───────────────────────────

function RequestsTab({ requests }: { requests: ChangeReq[] }) {
  // 미처리(답변 없음) 먼저, 그다음 최신순
  const sorted = [...requests].sort((a, b) => {
    const ao = a.reply ? 1 : 0;
    const bo = b.reply ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const openCount = requests.filter((c) => !c.reply).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        총 <b className="text-foreground">{requests.length}</b>건 · 미처리{" "}
        <b className="text-rose-600">{openCount}</b>
      </div>
      {sorted.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          변경 요청이 없습니다.
        </p>
      )}
      <div className="space-y-2">
        {sorted.map((r) => (
          <RequestRow key={r.id} req={r} />
        ))}
      </div>
    </div>
  );
}

function RequestRow({ req }: { req: ChangeReq }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState(req.reply ?? "");
  const [editing, setEditing] = useState(!req.reply);

  function save() {
    if (!reply.trim()) return toast.error("반영 내용을 입력하세요");
    startTransition(async () => {
      try {
        await replyLunchChangeRequest(req.id, reply);
        toast.success("반영 답변을 보냈어요 — 학부모가 확인할 수 있어요");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className={`rounded-lg border p-3 ${req.reply ? "border-line" : "border-rose-200 bg-rose-50/40"}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{req.studentName}</span>
        <span className="text-xs text-muted-foreground">{req.grade}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{dateTimeLabel(req.createdAt)}</span>
        {!req.reply && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            미처리
          </span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">✏️ {req.message}</p>

      {req.reply && !editing ? (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-emerald-700">
              반영 내용 {req.repliedByName ? `· ${req.repliedByName}` : ""}
            </span>
            {req.repliedAt && (
              <span className="text-[10.5px] text-muted-foreground">{dateTimeLabel(req.repliedAt)}</span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="ml-auto text-[11px] text-muted-foreground hover:underline"
            >
              수정
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{req.reply}</p>
        </div>
      ) : (
        <div className="mt-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="어떻게 반영했는지 학부모에게 안내할 내용을 입력…"
            className="w-full resize-y rounded-md border border-line bg-background px-2.5 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> 반영 답변 보내기
            </button>
            {req.reply && (
              <button
                onClick={() => {
                  setReply(req.reply ?? "");
                  setEditing(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── 배부 ───────────────────────────

function DistributeTab({ menus, orders }: { menus: Menu[]; orders: Order[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const paidItemsByDate = useMemo(() => {
    const m = new Map<
      string,
      { itemId: string; studentName: string; grade: string; received: boolean }[]
    >();
    for (const o of orders) {
      if (o.paidStatus !== "PAID") continue;
      for (const it of o.items) {
        const arr = m.get(it.date) ?? [];
        arr.push({
          itemId: it.id,
          studentName: o.studentName,
          grade: o.grade,
          received: it.received,
        });
        m.set(it.date, arr);
      }
    }
    return m;
  }, [orders]);

  const dates = menus
    .map((m) => m.date)
    .filter((d) => paidItemsByDate.has(d))
    .sort();

  function toggle(itemId: string, received: boolean) {
    startTransition(async () => {
      try {
        await setItemReceived(itemId, received);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  if (dates.length === 0)
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        입금 확인된 신청이 아직 없습니다.
      </p>
    );

  return (
    <div className="space-y-4">
      {dates.map((d) => {
        const list = (paidItemsByDate.get(d) ?? []).sort((a, b) =>
          a.studentName.localeCompare(b.studentName)
        );
        const got = list.filter((s) => s.received).length;
        return (
          <div key={d} className="rounded-lg border border-line">
            <div className="flex items-center gap-2 border-b border-line bg-muted/40 px-3 py-2">
              <Package className="h-4 w-4 text-brand" />
              <span className="font-semibold">{dateLabel(d)}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {got} / {list.length} 배부완료
              </span>
            </div>
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.itemId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={s.received}
                      onChange={(e) => toggle(s.itemId, e.target.checked)}
                      className="h-4 w-4 rounded accent-brand"
                    />
                    <span className={s.received ? "text-muted-foreground line-through" : ""}>
                      {s.studentName}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.grade}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── 설정 ───────────────────────────

function SettingsTab({ bankInfo, guideText }: { bankInfo: string; guideText: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bank, setBank] = useState(bankInfo);
  const [guide, setGuide] = useState(guideText);

  function save() {
    startTransition(async () => {
      try {
        await updateLunchSetting({ bankInfo: bank, guideText: guide });
        toast.success("저장되었어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Wallet className="h-4 w-4 text-brand" /> 입금 계좌
        </span>
        <input
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          placeholder="예: 국민 123-45-6789 (홍길동)"
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          학부모 신청 화면 하단에 그대로 표시됩니다.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">안내문 (선택)</span>
        <textarea
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
          rows={4}
          placeholder="예: 입금 시 학생 이름으로 보내주세요. 당일 오전 9시까지 신청 가능합니다."
          className="resize-y rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
      </label>
      <button
        onClick={save}
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
