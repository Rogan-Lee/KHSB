"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  EmptyState, FilterChip, FormField, SearchField, StatusBadge, TableCard, Toolbar,
} from "@/components/backoffice/ui";
import { cn, formatDate } from "@/lib/utils";
import { X, Pencil, Trash2, Eye, EyeOff, ClipboardList } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { updateMeritDemerit, deleteMeritDemerit, bulkDeleteMeritDemerits, toggleMeritDemeritVisibility, getMeritsByRange } from "@/actions/merit-demerit";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";

type MeritRecord = {
  id: string;
  date: Date;
  type: "MERIT" | "DEMERIT";
  points: number;
  category: string | null;
  reason: string;
  visibleInReport: boolean;
  student: { name: string; grade: string };
};

const MERIT_FILTER_KEY = "merit-history-filters";
function loadMeritFilters() {
  try { return JSON.parse(sessionStorage.getItem(MERIT_FILTER_KEY) ?? "{}"); } catch { return {}; }
}

const HEAD_CLASS = "h-10 whitespace-nowrap px-x4 t3-medium text-fg-neutral-subtle";

// 공용 DatePicker 를 폼 입력 규격(높이 40)으로 맞춘다
const DATE_FIELD_CLASS =
  "h-10 w-full justify-start gap-x2 rounded-r2 border-0 bg-bg-layer-default px-x3 t4-regular text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed";

function EditMeritDialog({
  record,
  open,
  onClose,
}: {
  record: MeritRecord;
  open: boolean;
  onClose: (refresh?: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<"MERIT" | "DEMERIT">(record.type);
  const dateStr = new Date(record.date).toISOString().split("T")[0];
  const { confirm, dialog } = useConfirmDialog();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    startTransition(async () => {
      try {
        await updateMeritDemerit(record.id, fd);
        toast.success("수정되었습니다");
        onClose(true);
      } catch {
        toast.error("수정 실패");
      }
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "이 상벌점을 삭제할까요?",
      description: `${record.student.name} · ${record.type === "MERIT" ? "상점" : "벌점"} ${record.points}점\n삭제하면 되돌릴 수 없어요.`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteMeritDemerit(record.id);
        toast.success("삭제되었습니다");
        onClose(true);
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>상벌점 수정</DialogTitle>
            <DialogDescription>
              {record.student.name} · {record.student.grade}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-x4">
            <div className="grid grid-cols-2 gap-x3">
              <FormField label="날짜" required>
                <DatePicker name="date" defaultValue={dateStr} required placeholder="날짜" className={DATE_FIELD_CLASS} />
              </FormField>
              <FormField label="구분" required>
                <Select value={type} onValueChange={(v) => setType(v as "MERIT" | "DEMERIT")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MERIT">상점</SelectItem>
                    <SelectItem value="DEMERIT">벌점</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-x3">
              <FormField label="점수" htmlFor="edit-merit-points" required>
                <Input id="edit-merit-points" name="points" type="number" min={1} max={100} defaultValue={record.points} required className="tabular-nums" />
              </FormField>
              <FormField label="카테고리" htmlFor="edit-merit-category">
                <Input id="edit-merit-category" name="category" defaultValue={record.category ?? ""} placeholder="선택사항" />
              </FormField>
            </div>
            <FormField label="사유" htmlFor="edit-merit-reason" required>
              <Input id="edit-merit-reason" name="reason" defaultValue={record.reason} required />
            </FormField>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending} className="text-fg-critical">
                <Trash2 />삭제
              </Button>
              <div className="flex flex-col-reverse gap-x2 sm:flex-row">
                <Button type="button" variant="secondary" onClick={() => onClose()}>취소</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "저장 중…" : "저장"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}

export function MeritHistoryTable({ records }: { records: MeritRecord[] }) {
  const router = useRouter();
  const saved = typeof window !== "undefined" ? loadMeritFilters() : {};
  const [query, setQuery] = useState<string>(saved.q ?? "");
  const [todayOnly, setTodayOnly] = useState<boolean>(false);
  // "오늘만"은 서버에서 오늘자 전체를 조회한다 (records prop은 최신 50건이라 오늘 기록이 잘릴 수 있음).
  const [todayRecords, setTodayRecords] = useState<MeritRecord[] | null>(null);
  const [todayLoading, startTodayTransition] = useTransition();
  const [editTarget, setEditTarget] = useState<MeritRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkPending, startBulkTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    try { sessionStorage.setItem(MERIT_FILTER_KEY, JSON.stringify({ q: query })); } catch {}
  }, [query]);

  const q = query.trim().toLowerCase();
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  function handleToggleToday() {
    const next = !todayOnly;
    setTodayOnly(next);
    if (next && todayRecords === null) {
      startTodayTransition(async () => {
        try {
          const rows = await getMeritsByRange(todayStr, todayStr);
          setTodayRecords(rows as MeritRecord[]);
        } catch { toast.error("오늘 상벌점 조회 실패"); }
      });
    }
  }

  // 오늘만 ON: 서버 조회 결과(오늘자 전체) 사용 / OFF: 최신 50건 prop 사용
  const source = todayOnly ? (todayRecords ?? []) : records;
  const baseFiltered = source.filter((r) => {
    if (q && !(
      r.student.name.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      (r.category ?? "").toLowerCase().includes(q)
    )) return false;
    return true;
  });

  // 헤더 클릭으로 정렬 (3-state 토글). 미정렬 시 서버 순서 유지.
  const { rows: filtered, sort, toggle } = useSortableTable(baseFiltered, {
    date: (r) => new Date(r.date).getTime(),
    name: (r) => r.student.name,
    points: (r) => r.points,
  });

  const filteredIds = filtered.map((m) => m.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const selectedCount = filteredIds.filter((id) => selected.has(id)).length;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]));
    }
  }
  function toggleOne(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function handleBulkDelete() {
    const ok = await confirm({
      title: `${selectedCount}건을 삭제할까요?`,
      description: "선택한 상벌점 내역이 모두 지워지고, 되돌릴 수 없어요.",
      confirmLabel: `${selectedCount}건 삭제`,
      destructive: true,
    });
    if (!ok) return;
    startBulkTransition(async () => {
      try {
        await bulkDeleteMeritDemerits(filteredIds.filter((id) => selected.has(id)));
        setSelected(new Set());
        toast.success(`${selectedCount}건 삭제됨`);
        router.refresh();
      } catch { toast.error("삭제 실패"); }
    });
  }
  function handleToggleVisibility(record: MeritRecord) {
    const nextVisible = !record.visibleInReport;
    startBulkTransition(async () => {
      try {
        await toggleMeritDemeritVisibility(record.id, nextVisible);
        toast.success(nextVisible ? "리포트에 표시됩니다" : "리포트에서 숨겨졌습니다");
        router.refresh();
      } catch {
        toast.error("변경 실패");
      }
    });
  }

  const filteredActive = !!q || todayOnly;

  return (
    <div>
      <Toolbar>
        <div className="relative w-full sm:w-72">
          <SearchField
            placeholder="이름·사유·카테고리 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pr-x9 sm:w-72"
            aria-label="상벌점 내역 검색"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <FilterChip
          selected={todayOnly}
          onClick={handleToggleToday}
          title="오늘 등록된 상벌점 전체 보기"
          count={todayOnly && !todayLoading ? filtered.length : undefined}
        >
          오늘만
        </FilterChip>
        {todayOnly && todayLoading ? (
          <span className="t3-regular text-fg-neutral-subtle">조회 중…</span>
        ) : (
          q && !todayOnly && <span className="t3-regular tabular-nums text-fg-neutral-subtle">{filtered.length}건</span>
        )}
        {selectedCount > 0 && (
          <Button variant="destructive" size="sm" className="ml-auto" onClick={handleBulkDelete} disabled={isBulkPending}>
            <Trash2 />{selectedCount}건 삭제
          </Button>
        )}
      </Toolbar>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
              </TableHead>
              <SortableHeader sortKey="date" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={HEAD_CLASS}>
                날짜
              </SortableHeader>
              <SortableHeader sortKey="name" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={HEAD_CLASS}>
                이름
              </SortableHeader>
              <TableHead>구분</TableHead>
              <SortableHeader sortKey="points" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className={HEAD_CLASS}>
                점수
              </SortableHeader>
              <TableHead>카테고리</TableHead>
              <TableHead>사유</TableHead>
              <TableHead className="w-16 text-center">리포트</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">수정</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-0">
                  {todayOnly && todayLoading ? (
                    <p className="py-x10 text-center t4-regular text-fg-neutral-subtle">오늘 내역을 불러오는 중…</p>
                  ) : (
                    <EmptyState
                      compact
                      icon={ClipboardList}
                      title={filteredActive ? "조건에 맞는 내역이 없어요" : "아직 상벌점 내역이 없어요"}
                      description={filteredActive ? "검색어나 오늘만 필터를 바꿔 보세요." : "위의 상벌점 부여에서 첫 내역을 만들어 보세요."}
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleOne(m.id)} aria-label={`${m.student.name} 선택`} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">{formatDate(m.date)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="t4-medium">{m.student.name}</span>
                    <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{m.student.grade}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={m.type === "MERIT" ? "ok" : "bad"}>
                      {m.type === "MERIT" ? "상점" : "벌점"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className={cn("text-right t4-bold", m.type === "MERIT" ? "text-fg-positive" : "text-fg-critical")}>
                    {m.type === "MERIT" ? "+" : "-"}{m.points}
                  </TableCell>
                  <TableCell className="text-fg-neutral-muted">{m.category || "—"}</TableCell>
                  <TableCell className="min-w-48">{m.reason}</TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(m)}
                      disabled={isBulkPending}
                      title={m.visibleInReport ? "리포트에 표시됨 — 숨기려면 클릭" : "리포트에서 숨김 — 표시하려면 클릭"}
                      aria-label={m.visibleInReport ? "리포트에서 숨기기" : "리포트에 표시하기"}
                      aria-pressed={m.visibleInReport}
                      className={cn(
                        "grid size-8 place-items-center rounded-full transition-colors hover:bg-bg-transparent-pressed disabled:text-fg-disabled",
                        m.visibleInReport ? "text-fg-neutral" : "text-fg-placeholder",
                      )}
                    >
                      {m.visibleInReport ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setEditTarget(m)}
                      aria-label={`${m.student.name} 상벌점 수정`}
                      className="grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      {editTarget && (
        <EditMeritDialog
          record={editTarget}
          open={!!editTarget}
          onClose={(refresh) => { setEditTarget(null); if (refresh) router.refresh(); }}
        />
      )}
      {dialog}
    </div>
  );
}
