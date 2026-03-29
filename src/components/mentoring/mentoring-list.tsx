"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { updateMentoringStatus, deleteMentoring, bulkDeleteMentorings } from "@/actions/mentoring";
import { toast } from "sonner";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

type SortKey = "scheduledAt" | "studentName" | "mentorName" | "time" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
  return sortDir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-1 text-foreground" />
    : <ArrowDown className="inline h-3 w-3 ml-1 text-foreground" />;
}

type Mentoring = {
  id: string;
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: keyof typeof STATUS_MAP;
  notes: string | null;
  student: { id: string; name: string; grade: string };
  mentor: { id: string; name: string };
};

type Mentor = { id: string; name: string };

type Props = {
  mentorings: Mentoring[];
  mentors: Mentor[];
  isDirector: boolean;
};

function toLocalDateString(date: Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function DeleteConfirmDialog({
  mentoring,
  open,
  onClose,
}: {
  mentoring: Mentoring;
  open: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteMentoring(mentoring.id);
        toast.success("삭제되었습니다");
        onClose();
      } catch {
        toast.error("삭제에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>멘토링 삭제</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{mentoring.student.name}</span>의{" "}
          {formatDate(mentoring.scheduledAt)} 멘토링을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteConfirmDialog({
  count,
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  count: number;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>멘토링 {count}건 삭제</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          선택한 멘토링 {count}건을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "삭제 중..." : `${count}건 삭제`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KebabMenu({ mentoring, onDelete }: { mentoring: Mentoring; onDelete: () => void }) {
  const [isPending, startTransition] = useTransition();

  function changeStatus(status: keyof typeof STATUS_MAP) {
    startTransition(async () => {
      try {
        await updateMentoringStatus(mentoring.id, status);
        toast.success(`${STATUS_MAP[status].label}으로 변경되었습니다`);
      } catch {
        toast.error("상태 변경에 실패했습니다");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>상태 변경</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(Object.entries(STATUS_MAP) as [keyof typeof STATUS_MAP, { label: string }][]).map(([value, { label }]) => (
              <DropdownMenuItem
                key={value}
                onClick={() => changeStatus(value)}
                disabled={mentoring.status === value}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MentoringList({ mentorings, mentors, isDirector }: Props) {
  const today = getToday();
  const [selectedMentorId, setSelectedMentorId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Mentoring | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkPending, startBulkTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduledAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = mentorings.filter((m) => {
    if (selectedMentorId !== "all" && m.mentor.id !== selectedMentorId) return false;
    const dateStr = toLocalDateString(m.scheduledAt);
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo) return false;
    if (q && !m.student.name.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortKey === "scheduledAt") cmp = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    else if (sortKey === "studentName") cmp = a.student.name.localeCompare(b.student.name, "ko");
    else if (sortKey === "mentorName") cmp = a.mentor.name.localeCompare(b.mentor.name, "ko");
    else if (sortKey === "time") cmp = (a.scheduledTimeStart ?? "").localeCompare(b.scheduledTimeStart ?? "");
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const filteredIds = filtered.map((m) => m.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = filteredIds.some((id) => selected.has(id));
  const selectedCount = filteredIds.filter((id) => selected.has(id)).length;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    startBulkTransition(async () => {
      try {
        const ids = filteredIds.filter((id) => selected.has(id));
        await bulkDeleteMentorings(ids);
        setSelected(new Set());
        setBulkDeleteOpen(false);
        toast.success(`${ids.length}건 삭제되었습니다`);
      } catch {
        toast.error("삭제에 실패했습니다");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {isDirector && (
          <>
            <span className="text-sm text-muted-foreground">담당 멘토</span>
            <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {mentors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="text-sm text-muted-foreground">날짜</span>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">~</span>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        {dateFrom || dateTo ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
          >
            전체 보기
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => { setDateFrom(today); setDateTo(today); }}
          >
            오늘만
          </Button>
        )}
        <div className="relative ml-2">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="원생 이름 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-44 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {someSelected && selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {selectedCount}건 삭제
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{filtered.length}건</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("scheduledAt")}>
                예정일<SortIcon col="scheduledAt" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("studentName")}>
                원생<SortIcon col="studentName" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              {isDirector && (
                <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("mentorName")}>
                  멘토<SortIcon col="mentorName" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
              )}
              <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("time")}>
                시간<SortIcon col="time" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("status")}>
                상태<SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead>메모</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isDirector ? 8 : 7} className="text-center text-muted-foreground py-8">
                  멘토링 기록이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggleOne(m.id)}
                      aria-label={`${m.student.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(m.scheduledAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium">{m.student.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                  </TableCell>
                  {isDirector && <TableCell className="whitespace-nowrap">{m.mentor.name}</TableCell>}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {m.scheduledTimeStart && m.scheduledTimeEnd
                      ? `${m.scheduledTimeStart}~${m.scheduledTimeEnd}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_MAP[m.status].variant}>
                      {STATUS_MAP[m.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-48">
                    {m.notes || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/mentoring/${m.id}`}>
                        <Button variant="ghost" size="sm">기록</Button>
                      </Link>
                      <KebabMenu
                        mentoring={m}
                        onDelete={() => setDeleteTarget(m)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {deleteTarget && (
        <DeleteConfirmDialog
          mentoring={deleteTarget}
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      <BulkDeleteConfirmDialog
        count={selectedCount}
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        isPending={isBulkPending}
      />
    </div>
  );
}
