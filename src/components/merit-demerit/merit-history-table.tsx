"use client";

import { useState, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Search, X, ArrowUp, ArrowDown, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { updateMeritDemerit, deleteMeritDemerit, bulkDeleteMeritDemerits } from "@/actions/merit-demerit";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type MeritRecord = {
  id: string;
  date: Date;
  type: "MERIT" | "DEMERIT";
  points: number;
  category: string | null;
  reason: string;
  student: { name: string; grade: string };
};

type SortKey = "date" | "name" | "points";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
  return sortDir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-1 text-foreground" />
    : <ArrowDown className="inline h-3 w-3 ml-1 text-foreground" />;
}

const MERIT_FILTER_KEY = "merit-history-filters";
function loadMeritFilters() {
  try { return JSON.parse(sessionStorage.getItem(MERIT_FILTER_KEY) ?? "{}"); } catch { return {}; }
}

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
  const dateStr = new Date(record.date).toISOString().split("T")[0];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
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

  function handleDelete() {
    if (!confirm("삭제하시겠습니까?")) return;
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>상벌점 수정 — {record.student.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">날짜</Label>
              <DatePicker name="date" defaultValue={dateStr} required placeholder="날짜" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">구분</Label>
              <Select name="type" defaultValue={record.type}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MERIT">상점</SelectItem>
                  <SelectItem value="DEMERIT">벌점</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">점수</Label>
              <Input name="points" type="number" min={1} max={100} defaultValue={record.points} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">카테고리</Label>
              <Input name="category" defaultValue={record.category ?? ""} placeholder="선택사항" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">사유</Label>
            <Input name="reason" defaultValue={record.reason} required />
          </div>
          <DialogFooter className="flex justify-between pt-2">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onClose()}>취소</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MeritHistoryTable({ records }: { records: MeritRecord[] }) {
  const router = useRouter();
  const saved = typeof window !== "undefined" ? loadMeritFilters() : {};
  const [query, setQuery] = useState<string>(saved.q ?? "");
  const [sortKey, setSortKey] = useState<SortKey>(saved.sort ?? "points");
  const [sortDir, setSortDir] = useState<SortDir>(saved.dir ?? "desc");
  const [editTarget, setEditTarget] = useState<MeritRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkPending, startBulkTransition] = useTransition();

  useEffect(() => {
    try { sessionStorage.setItem(MERIT_FILTER_KEY, JSON.stringify({ q: query, sort: sortKey, dir: sortDir })); } catch {}
  }, [query, sortKey, sortDir]);

  const q = query.trim().toLowerCase();

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = (
    q
      ? records.filter(
          (r) =>
            r.student.name.toLowerCase().includes(q) ||
            r.reason.toLowerCase().includes(q) ||
            (r.category ?? "").toLowerCase().includes(q)
        )
      : [...records]
  ).sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date") cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    else if (sortKey === "points") cmp = a.points - b.points;
    else if (sortKey === "name") cmp = a.student.name.localeCompare(b.student.name, "ko");
    return sortDir === "asc" ? cmp : -cmp;
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
  function handleBulkDelete() {
    if (!confirm(`${selectedCount}건을 삭제하시겠습니까?`)) return;
    startBulkTransition(async () => {
      try {
        await bulkDeleteMeritDemerits(filteredIds.filter((id) => selected.has(id)));
        setSelected(new Set());
        toast.success(`${selectedCount}건 삭제됨`);
        router.refresh();
      } catch { toast.error("삭제 실패"); }
    });
  }

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 사유, 카테고리 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-56 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {q && <span className="text-xs text-muted-foreground">{filtered.length}건 검색됨</span>}
        {selectedCount > 0 && (
          <Button variant="destructive" size="sm" className="ml-auto h-8 gap-1.5" onClick={handleBulkDelete} disabled={isBulkPending}>
            <Trash2 className="h-3.5 w-3.5" />{selectedCount}건 삭제
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
            </TableHead>
            <TableHead className={thClass} onClick={() => handleSort("date")}>
              날짜<SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className={thClass} onClick={() => handleSort("name")}>
              이름<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead>구분</TableHead>
            <TableHead className={thClass} onClick={() => handleSort("points")}>
              점수<SortIcon col="points" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead>카테고리</TableHead>
            <TableHead>사유</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {q ? "검색 결과가 없습니다" : "상벌점 내역이 없습니다"}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((m) => (
              <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleOne(m.id)} />
                </TableCell>
                <TableCell>{formatDate(m.date)}</TableCell>
                <TableCell>
                  <span className="font-medium">{m.student.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={m.type === "MERIT" ? "default" : "destructive"}>
                    {m.type === "MERIT" ? "상점" : "벌점"}
                  </Badge>
                </TableCell>
                <TableCell className={`font-medium ${m.type === "MERIT" ? "text-green-600" : "text-red-600"}`}>
                  {m.type === "MERIT" ? "+" : "-"}{m.points}
                </TableCell>
                <TableCell>{m.category || "-"}</TableCell>
                <TableCell>{m.reason}</TableCell>
                <TableCell>
                  <button
                    onClick={() => setEditTarget(m)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {editTarget && (
        <EditMeritDialog
          record={editTarget}
          open={!!editTarget}
          onClose={(refresh) => { setEditTarget(null); if (refresh) router.refresh(); }}
        />
      )}
    </div>
  );
}
