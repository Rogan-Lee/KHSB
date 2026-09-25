"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2,
  Check,
  Package,
  ChevronLeft,
  ChevronRight,
  Send,
  LinkIcon,
  Pencil,
  ClipboardList,
  MessageSquareText,
  Users,
  X,
} from "lucide-react";
import { shiftMonth, formatYearMonth } from "@/lib/online/month";
import { useStickyState } from "@/hooks/use-sticky-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  Notice,
  PageHeader,
  SearchField,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  Toolbar,
} from "@/components/backoffice/ui";
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
  staffUpdateLunchOrderItems,
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
  const [tab, setTab] = useStickyState<Tab>("lunch-admin:tab", "menu");
  const pendingCount = orders.filter((o) => o.paidStatus === "PENDING").length;
  const openRequestCount = changeRequests.filter((c) => !c.reply).length;

  // 요약 지표 — 표시용 집계(서버 데이터 그대로)
  const claimedCount = orders.filter((o) => o.paidStatus === "PENDING" && o.depositClaimed).length;
  const paidOrders = orders.filter((o) => o.paidStatus === "PAID");
  const paidTotal = paidOrders.reduce(
    (s, o) => s + o.items.reduce((a, it) => a + it.price, 0),
    0
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "menu", label: "메뉴·발주" },
    { key: "orders", label: "신청·입금", badge: pendingCount },
    { key: "links", label: "학부모 링크" },
    { key: "requests", label: "변경 요청", badge: openRequestCount },
    { key: "distribute", label: "배부" },
    { key: "settings", label: "설정" },
  ];

  return (
    <div>
      <PageHeader
        title="점심 도시락"
        description="월별 메뉴를 올리고 학부모 신청·입금·배부까지 한곳에서 관리해요."
      />

      <StatCards cols={4} className="mb-x6">
        <StatCard label="전체 신청" value={orders.length} unit="건" />
        <StatCard
          label="미입금"
          value={pendingCount}
          unit="건"
          tone={pendingCount > 0 ? "warn" : "gray"}
          sub={claimedCount > 0 ? `입금 알림 ${claimedCount}건` : undefined}
        />
        <StatCard
          label="입금 완료"
          value={paidTotal.toLocaleString("ko-KR")}
          unit="원"
          sub={`${paidOrders.length}건`}
        />
        <StatCard
          label="미처리 변경 요청"
          value={openRequestCount}
          unit="건"
          tone={openRequestCount > 0 ? "bad" : "gray"}
        />
      </StatCards>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {t.badge ? (
                <span className="t4-bold tabular-nums text-fg-brand">{t.badge}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-x6">
        {tab === "menu" && <CalendarMenuTab ym={ym} menus={menus} orders={orders} />}
        {tab === "orders" && <OrdersTab orders={orders} menus={menus} />}
        {tab === "links" && (
          <LinksTab students={students} canIssue={canIssueLinks} orders={orders} />
        )}
        {tab === "requests" && <RequestsTab requests={changeRequests} />}
        {tab === "distribute" && <DistributeTab menus={menus} orders={orders} />}
        {tab === "settings" && <SettingsTab bankInfo={bankInfo} guideText={guideText} />}
      </div>
    </div>
  );
}

// ─────────────────────────── 메뉴 · 발주 (달력) ───────────────────────────

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dowTone(dow: number) {
  return dow === 0 ? "text-fg-critical" : dow === 6 ? "text-fg-informative" : "text-fg-neutral";
}

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
  // 마지막 주를 7칸으로 채워 격자 선이 끊기지 않게 한다 (표시용)
  const gridCells = [...cells, ...Array((7 - (cells.length % 7)) % 7).fill(null)];

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
    <div className="flex flex-col gap-x4">
      {/* 월 이동 + 발주 합계 */}
      <Toolbar className="mb-0 justify-between gap-x3">
        <div className="flex items-center gap-x1">
          <Button asChild variant="ghost" size="icon" className="size-x9">
            <Link href={`/lunch?ym=${shiftMonth(ym, -1)}`} aria-label="이전 달">
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-28 text-center t6-bold tabular-nums text-fg-neutral">
            {formatYearMonth(ym)}
          </h2>
          <Button asChild variant="ghost" size="icon" className="size-x9">
            <Link href={`/lunch?ym=${shiftMonth(ym, 1)}`} aria-label="다음 달">
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <p className="t4-regular tabular-nums text-fg-neutral-muted">
          이번 달 발주{" "}
          <span className="t4-bold text-fg-neutral">{totalQty}개</span>
          <span className="mx-x1_5 text-fg-placeholder">·</span>
          <span className="t4-bold text-fg-neutral">{WON(totalCost)}</span>
        </p>
      </Toolbar>

      {/* 편집 패널 (선택된 날짜) */}
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
      <div className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
        <div className="grid grid-cols-7 border-b border-stroke-neutral-muted bg-bg-layer-fill text-center">
          {DOW.map((d, i) => (
            <div key={d} className={cn("py-x2 t3-medium", i === 0 || i === 6 ? dowTone(i) : "text-fg-neutral-subtle")}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-stroke-neutral-muted">
          {gridCells.map((dateStr, idx) => {
            if (!dateStr)
              return <div key={idx} className="min-h-[88px] bg-bg-layer-fill" aria-hidden />;
            const menu = byDate.get(dateStr);
            const q = menu ? qtyByMenu.get(menu.id) : undefined;
            const day = Number(dateStr.slice(-2));
            const dow = (firstDow + day - 1) % 7;
            const active = editDate === dateStr;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setEditDate(dateStr)}
                aria-pressed={active}
                aria-label={`${dateLabel(dateStr)} ${menu ? menu.name : "메뉴 추가"}`}
                className={cn(
                  "flex min-h-[88px] min-w-0 flex-col items-start gap-x0_5 bg-bg-layer-default p-x2 text-left transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring",
                  active && "bg-bg-brand-weak shadow-[inset_0_0_0_2px_var(--seed-color-stroke-brand-solid)] hover:bg-bg-brand-weak"
                )}
              >
                <span className={cn("t3-bold tabular-nums", dowTone(dow))}>{day}</span>
                {menu ? (
                  <div className={cn("w-full min-w-0", menu.closed && "opacity-60")}>
                    <p className="truncate t3-medium text-fg-neutral">{menu.name}</p>
                    <p className="t2-regular tabular-nums text-fg-neutral-subtle">{WON(menu.price)}</p>
                    {q && q.paid + q.pending > 0 && (
                      <p className="t2-medium tabular-nums">
                        <span className="text-fg-positive">{q.paid}</span>
                        {q.pending > 0 && <span className="text-fg-warning"> +{q.pending}</span>}
                        <span className="text-fg-neutral-subtle">건</span>
                      </p>
                    )}
                    {menu.closed && <p className="t2-medium text-fg-neutral-subtle">마감</p>}
                  </div>
                ) : (
                  <span className="mt-x1 t2-regular text-fg-placeholder">+ 메뉴</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="t3-regular text-fg-neutral-subtle">
        날짜를 눌러 메뉴·가격·여유분을 입력해요. 발주 수량은 입금 완료 + 여유분이에요. 칸의{" "}
        <span className="t3-bold text-fg-positive">숫자</span>는 입금 완료,{" "}
        <span className="t3-bold text-fg-warning">+숫자</span>는 미입금 건수예요.
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
    <section
      aria-label={`${dateLabel(date)} 메뉴 편집`}
      className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5"
    >
      <div className="mb-x4 flex items-center justify-between gap-x3">
        <div className="min-w-0">
          <h3 className="t5-bold tabular-nums text-fg-neutral">{dateLabel(date)}</h3>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
            {menu ? "메뉴를 고치거나 마감할 수 있어요" : "새 메뉴를 등록해요 · 저장하면 다음 날로 넘어가요"}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-x9" onClick={onClose} aria-label="편집 닫기">
          <X />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x3 sm:flex sm:items-end">
        <FormField label="메뉴명" htmlFor="lunch-menu-name" required className="col-span-2 sm:min-w-0 sm:flex-1">
          <Input
            id="lunch-menu-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="예: 제육덮밥"
          />
        </FormField>
        <FormField label="가격(원)" htmlFor="lunch-menu-price" required className="sm:w-32">
          <Input
            id="lunch-menu-price"
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="6000"
            className="tabular-nums"
          />
        </FormField>
        <FormField label="여유분" htmlFor="lunch-menu-buffer" className="sm:w-24">
          <Input
            id="lunch-menu-buffer"
            type="number"
            inputMode="numeric"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            placeholder="0"
            title="비워두면 0. 학부모 신청/선택과는 무관합니다."
            className="tabular-nums"
          />
        </FormField>
        <Button onClick={save} disabled={pending} className="col-span-2 sm:col-auto">
          {pending ? "저장 중…" : "저장하고 다음 날"}
          {!pending && <ChevronRight />}
        </Button>
      </div>

      {menu && (
        <div className="mt-x4 flex flex-wrap items-center gap-x3 border-t border-stroke-neutral-muted pt-x4">
          <label className="flex cursor-pointer items-center gap-x2 t4-medium text-fg-neutral">
            <Checkbox
              defaultChecked={menu.closed}
              disabled={pending}
              onCheckedChange={(c) => {
                startTransition(async () => {
                  await updateLunchMenu({ id: menu.id, closed: c === true });
                  router.refresh();
                });
              }}
            />
            마감
            <span className="t3-regular text-fg-neutral-subtle">학부모 신규 신청을 막아요</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={pending}
            title="삭제 (신청 없는 메뉴만)"
            className="ml-auto text-fg-critical"
          >
            <Trash2 />
            메뉴 삭제
          </Button>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────── 신청 · 입금 ───────────────────────────

const ITEM_PREVIEW = 3;

function OrderItemsCell({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const items = order.items.slice().sort((a, b) => a.date.localeCompare(b.date));
  const shown = expanded ? items : items.slice(0, ITEM_PREVIEW);
  const hidden = items.length - shown.length;
  return (
    <div className="min-w-[220px]">
      <ul className="flex flex-col gap-x0_5">
        {shown.map((it) => (
          <li key={it.date} className="flex gap-x2 t3-regular">
            <span className="w-[4.5rem] shrink-0 whitespace-nowrap t3-medium tabular-nums text-fg-neutral">
              {dateLabel(it.date)}
            </span>
            <span className="min-w-0 text-fg-neutral-muted">{it.name.replace(/,/g, ", ")}</span>
          </li>
        ))}
      </ul>
      {items.length > ITEM_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-x1 t3-medium text-fg-neutral-subtle hover:text-fg-neutral"
        >
          {expanded ? "접기" : `외 ${hidden}일 더 보기`}
        </button>
      )}
      {order.memo && (
        <p className="mt-x1_5 rounded-r2 bg-bg-layer-fill px-x2 py-x1 t3-regular text-fg-neutral-muted">
          메모 · {order.memo}
        </p>
      )}
    </div>
  );
}

function OrdersTab({ orders, menus }: { orders: Order[]; menus: Menu[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSel, setEditSel] = useState<Set<string>>(new Set());
  const [editBusy, startEditTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const sortedMenus = useMemo(
    () => menus.slice().sort((a, b) => a.date.localeCompare(b.date)),
    [menus]
  );
  function startEdit(o: Order) {
    setEditingId(o.id);
    setEditSel(new Set(o.items.map((it) => it.menuId)));
  }
  function toggleEditMenu(id: string) {
    setEditSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function saveEdit(orderId: string) {
    startEditTransition(async () => {
      try {
        const res = await staffUpdateLunchOrderItems(orderId, [...editSel]);
        toast.success(res.count === 0 ? "신청을 삭제했어요" : `${res.count}일로 수정했어요`);
        setEditingId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

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
  // 삭제 확인은 다이얼로그에서 — 확인 후 실행
  function remove(o: Order) {
    startTransition(async () => {
      try {
        await deleteLunchOrder(o.id);
        toast.success("신청을 삭제했어요");
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(o.id);
          return next;
        });
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }
  const orderTotal = (o: Order) => o.items.reduce((s, it) => s + it.price, 0);
  const pendingTotal = orders.filter((o) => o.paidStatus === "PENDING").length;
  const claimedCount = orders.filter(
    (o) => o.paidStatus === "PENDING" && o.depositClaimed
  ).length;

  const COLS = 6;

  return (
    <div>
      <Toolbar>
        <FilterChip selected={!onlyUnpaid} onClick={() => setOnlyUnpaid(false)} count={orders.length}>
          전체
        </FilterChip>
        <FilterChip selected={onlyUnpaid} onClick={() => setOnlyUnpaid(true)} count={pendingTotal}>
          미입금
        </FilterChip>
        {claimedCount > 0 && (
          <span className="t3-medium tabular-nums text-fg-positive">
            입금 알림 {claimedCount}건
          </span>
        )}
        <div className="ml-auto flex items-center gap-x3">
          {selected.size > 0 && (
            <span className="t4-medium tabular-nums text-fg-neutral-muted">{selected.size}건 선택됨</span>
          )}
          <Button size="sm" onClick={confirmSelected} disabled={pending || selected.size === 0}>
            <Check />
            선택 {selected.size}건 입금 확인
          </Button>
        </div>
      </Toolbar>

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={orders.length === 0 ? "아직 들어온 신청이 없어요" : "미입금 신청이 없어요"}
            description={
              orders.length === 0
                ? "학부모 링크를 보내면 신청이 여기에 모여요."
                : "모든 신청의 입금이 확인됐어요."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={selectablePending.length === 0}
                    aria-label="미입금 전체 선택"
                  />
                </TableHead>
                <TableHead>학생</TableHead>
                <TableHead>신청 날짜</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const paid = o.paidStatus === "PAID";
                const editing = editingId === o.id;
                return (
                  <OrderRows
                    key={o.id}
                    order={o}
                    paid={paid}
                    editing={editing}
                    checked={selected.has(o.id)}
                    total={orderTotal(o)}
                    busy={pending}
                    onToggle={() => toggle(o.id)}
                    onRevert={() => revert(o.id)}
                    onEditToggle={() => (editing ? setEditingId(null) : startEdit(o))}
                    onDelete={() => setDeleteTarget(o)}
                    editPanel={
                      editing ? (
                        <TableRow className="bg-bg-layer-fill hover:bg-bg-layer-fill">
                          <TableCell colSpan={COLS} className="px-x5 py-x4">
                            <p className="mb-x3 t4-medium text-fg-neutral">
                              신청 날짜 수정
                              <span className="ml-x2 t3-regular text-fg-neutral-subtle">
                                포함할 날짜를 선택하세요
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-x1_5">
                              {sortedMenus.map((m) => (
                                <FilterChip
                                  key={m.id}
                                  selected={editSel.has(m.id)}
                                  onClick={() => toggleEditMenu(m.id)}
                                  title={m.closed ? "마감된 메뉴" : undefined}
                                  className={cn("tabular-nums", m.closed && "opacity-60")}
                                >
                                  {dateLabel(m.date)} {m.name}
                                </FilterChip>
                              ))}
                            </div>
                            <div className="mt-x4 flex items-center justify-end gap-x2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                취소
                              </Button>
                              <Button size="sm" onClick={() => saveEdit(o.id)} disabled={editBusy}>
                                <Check />
                                {editBusy ? "저장 중…" : `${editSel.size}일 저장`}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신청 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${deleteTarget.studentName} 학생의 신청(${deleteTarget.items.length}일)을 삭제할까요? 되돌릴 수 없어요.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && remove(deleteTarget)}
              disabled={pending}
            >
              {pending ? "삭제 중…" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderRows({
  order: o,
  paid,
  editing,
  checked,
  total,
  busy,
  onToggle,
  onRevert,
  onEditToggle,
  onDelete,
  editPanel,
}: {
  order: Order;
  paid: boolean;
  editing: boolean;
  checked: boolean;
  total: number;
  busy: boolean;
  onToggle: () => void;
  onRevert: () => void;
  onEditToggle: () => void;
  onDelete: () => void;
  editPanel: ReactNode;
}) {
  return (
    <>
      <TableRow data-state={checked ? "selected" : undefined} className={cn(editing && "border-b-0")}>
        <TableCell className="align-top">
          {!paid && (
            <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`${o.studentName} 선택`} />
          )}
        </TableCell>
        <TableCell className="align-top">
          <p className="whitespace-nowrap t4-medium text-fg-neutral">{o.studentName}</p>
          <p className="mt-x0_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
            {o.grade} · {o.parentPhone}
          </p>
        </TableCell>
        <TableCell className="align-top">
          <OrderItemsCell order={o} />
        </TableCell>
        <TableCell className="align-top text-right">
          <p className="whitespace-nowrap t4-bold tabular-nums text-fg-neutral">{WON(total)}</p>
          <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">총 {o.items.length}일</p>
        </TableCell>
        <TableCell className="align-top">
          <div className="flex flex-col items-start gap-x1">
            <StatusBadge tone={paid ? "ok" : "warn"}>{paid ? "입금 확인" : "미입금"}</StatusBadge>
            {!paid && o.depositClaimed && (
              <StatusBadge tone="info">
                <span title="학부모가 입금했다고 알렸어요">입금 알림</span>
              </StatusBadge>
            )}
          </div>
        </TableCell>
        <TableCell className="align-top text-right">
          <div className="flex items-center justify-end gap-x1">
            {paid && (
              <Button variant="ghost" size="xs" onClick={onRevert} disabled={busy}>
                확인 취소
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={onEditToggle}
              disabled={busy}
              title="신청 내용 수정"
              aria-expanded={editing}
            >
              <Pencil />
              {editing ? "닫기" : "수정"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={onDelete}
              disabled={busy}
              title="신청 삭제(취소)"
              className="text-fg-critical"
            >
              <Trash2 />
              삭제
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {editPanel}
    </>
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
    <div className="flex flex-col gap-x4">
      {!canIssue && (
        <Notice tone="warn">
          링크 신규 발급은 원장/관리자 권한이 필요해요. 이미 발급된 링크는 복사할 수 있어요.
        </Notice>
      )}

      <div>
        <Toolbar>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·학년 검색"
            aria-label="학생 검색"
          />
          <span className="t4-regular tabular-nums text-fg-neutral-subtle">{filtered.length}명</span>
          <Button
            size="sm"
            onClick={copySelected}
            disabled={pending || selected.size === 0 || !canIssue}
            title={!canIssue ? "링크 발급은 원장/관리자만" : undefined}
            className="ml-auto"
          >
            <Send />
            {pending ? "링크 만드는 중…" : `선택 ${selected.size}명 링크 복사`}
          </Button>
        </Toolbar>

        <TableCard>
          {filtered.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title={students.length === 0 ? "재원 중인 학생이 없어요" : "검색 결과가 없어요"}
              description={students.length === 0 ? undefined : "이름이나 학년을 다시 확인해 주세요."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label={`전체 선택 (${filtered.length}명)`}
                    />
                  </TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>신청</TableHead>
                  <TableHead>링크</TableHead>
                  <TableHead className="text-right">복사</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={() => toggle(s.id)}
                        aria-label={`${s.name} 선택`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap t4-medium">{s.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-fg-neutral-muted">{s.grade}</TableCell>
                    <TableCell>
                      {orderedIds.has(s.id) ? (
                        <StatusBadge tone="brand">신청함</StatusBadge>
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={s.token ? "ok" : "gray"}>
                        {s.token ? "링크 있음" : "링크 없음"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="xs" onClick={() => copyOne(s)}>
                        <LinkIcon />
                        복사
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
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
    <Section
      title="변경 요청"
      count={requests.length}
      description={
        requests.length > 0 ? (
          <span className="tabular-nums">
            미처리 <span className={cn("t4-bold", openCount > 0 ? "text-fg-critical" : "text-fg-neutral")}>{openCount}</span>건 ·
            답변을 보내면 학부모 신청 화면에 표시돼요
          </span>
        ) : undefined
      }
      flush
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="변경 요청이 없어요"
          description="학부모가 신청 화면에서 변경을 요청하면 여기에 모여요."
        />
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
          {sorted.map((r) => (
            <RequestRow key={r.id} req={r} />
          ))}
        </ul>
      )}
    </Section>
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
    <li className="px-x5 py-x4">
      <div className="flex flex-wrap items-center gap-x2">
        <span className="t4-bold text-fg-neutral">{req.studentName}</span>
        <span className="t3-regular text-fg-neutral-subtle">{req.grade}</span>
        {!req.reply && <StatusBadge tone="bad">미처리</StatusBadge>}
        <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
          {dateTimeLabel(req.createdAt)}
        </span>
      </div>
      <p className="mt-x2 whitespace-pre-wrap t4-regular text-fg-neutral">{req.message}</p>

      {req.reply && !editing ? (
        <div className="mt-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
          <div className="flex flex-wrap items-center gap-x2">
            <span className="t3-bold text-fg-positive">
              반영 완료{req.repliedByName ? ` · ${req.repliedByName}` : ""}
            </span>
            {req.repliedAt && (
              <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                {dateTimeLabel(req.repliedAt)}
              </span>
            )}
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setEditing(true)}>
              <Pencil />
              수정
            </Button>
          </div>
          <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral">{req.reply}</p>
        </div>
      ) : (
        <div className="mt-x3">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-label={`${req.studentName} 변경 요청 반영 답변`}
            placeholder="어떻게 반영했는지 학부모에게 안내할 내용을 입력…"
            className="resize-y"
          />
          <div className="mt-x2 flex items-center justify-end gap-x2">
            {req.reply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReply(req.reply ?? "");
                  setEditing(false);
                }}
              >
                취소
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={pending}>
              <Send />
              {pending ? "보내는 중…" : "반영 답변 보내기"}
            </Button>
          </div>
        </div>
      )}
    </li>
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
      <Section>
        <EmptyState
          icon={Package}
          title="배부할 도시락이 없어요"
          description="입금 확인된 신청이 생기면 날짜별 배부 명단이 만들어져요."
        />
      </Section>
    );

  return (
    <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-2">
      {dates.map((d) => {
        const list = (paidItemsByDate.get(d) ?? []).sort((a, b) =>
          a.studentName.localeCompare(b.studentName)
        );
        const got = list.filter((s) => s.received).length;
        const done = got === list.length;
        return (
          <Section
            key={d}
            title={<span className="tabular-nums">{dateLabel(d)}</span>}
            actions={
              <StatusBadge tone={done ? "ok" : "gray"}>
                {got} / {list.length} 배부
              </StatusBadge>
            }
            flush
          >
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              {list.map((s) => (
                <li key={s.itemId}>
                  <label className="flex cursor-pointer items-center gap-x3 px-x5 py-x3 transition-colors hover:bg-bg-layer-default-pressed">
                    <Checkbox
                      checked={s.received}
                      onCheckedChange={(c) => toggle(s.itemId, c === true)}
                    />
                    <span
                      className={cn(
                        "t4-medium",
                        s.received ? "text-fg-neutral-subtle line-through" : "text-fg-neutral"
                      )}
                    >
                      {s.studentName}
                    </span>
                    <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                    {s.received && (
                      <span className="ml-auto t3-medium text-fg-positive">받음</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </Section>
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
    <Section
      title="입금·안내 설정"
      description="학부모 신청 화면에 그대로 보이는 정보예요."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-x5">
        <FormField label="입금 계좌" htmlFor="lunch-bank-info" hint="학부모 신청 화면 하단에 그대로 표시돼요.">
          <Input
            id="lunch-bank-info"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="예: 국민 123-45-6789 (홍길동)"
          />
        </FormField>
        <FormField label="안내문 (선택)" htmlFor="lunch-guide-text">
          <Textarea
            id="lunch-guide-text"
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            rows={4}
            placeholder="예: 입금 시 학생 이름으로 보내주세요. 당일 오전 9시까지 신청 가능합니다."
            className="resize-y"
          />
        </FormField>
        <FormActions>
          <Button onClick={save} disabled={pending} className="w-full sm:w-auto">
            {pending ? "저장 중…" : "저장"}
          </Button>
        </FormActions>
      </div>
    </Section>
  );
}
