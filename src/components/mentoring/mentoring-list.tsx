"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MoreHorizontal, Search, Trash2, X, Link2, ExternalLink, CheckCircle2, ChevronDown, ChevronRight, Send, Loader2, Filter, Camera, ChevronLeft, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";
import { ParentReportInlinePanel } from "./parent-report-inline-panel";
import { DatePicker } from "@/components/ui/date-picker";
import { updateMentoringStatus, updateMentoringNotes, deleteMentoring, bulkDeleteMentorings } from "@/actions/mentoring";
import { createParentReportsBulk, type BulkParentReportResult } from "@/actions/parent-reports";
import { toast } from "sonner";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

type Mentoring = {
  id: string;
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: keyof typeof STATUS_MAP;
  notes: string | null;
  student: {
    id: string; name: string; grade: string; seat?: string | null; vocabTestDate?: Date | null;
    schedules?: { dayOfWeek: number; startTime: string; endTime: string }[];
  };
  mentor: { id: string; name: string };
  /** 이 멘토링에 연결된 학부모 리포트 (최신 1건) */
  parentReports?: { id: string; token: string; createdAt: Date }[];
  /** 연결된 사진(KDA 등) 개수 — 리스트에서 업로드 여부 표시용 */
  _count?: { photos: number } | null;
};

type Mentor = { id: string; name: string };

type Props = {
  mentorings: Mentoring[];
  mentors: Mentor[];
  isDirector: boolean;
  currentUserId?: string;
  checkedInStudentIds?: string[];
  vocabEnrolledStudentIds?: string[];
  attendanceNotes?: Record<string, string>;
  /** 이달 기준 학생별 상/벌점 누적 (§2.17) */
  meritPoints?: Record<string, { positive: number; negative: number }>;
  /** 서버 측 조회 범위(URL ?from=&to=). 클라이언트는 표시만 하고 변경 시 navigate. */
  initialDateFrom: string;
  initialDateTo: string;
};

const PAGE_SIZE = 20;

/** 이달 상벌점 임계값을 넘으면 이모지 표시 (§2.17). 임계값: 상점 10↑ / 벌점 15↑ */
function MeritBadge({ positive, negative }: { positive: number; negative: number }) {
  if (positive < 10 && negative < 15) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-sm leading-none shrink-0">
      {positive >= 10 && <span title={`이달 상점 ${positive}점`}>👍</span>}
      {negative >= 15 && <span title={`이달 벌점 ${negative}점`}>🤬</span>}
    </span>
  );
}

function isVocabDone(vocabTestDate: Date | null | undefined): boolean {
  if (!vocabTestDate) return false;
  const now = new Date();
  const day = now.getDay();
  const daysBack = day === 0 ? 5 : day === 1 ? 6 : day - 2;
  const lastTue = new Date(now);
  lastTue.setDate(now.getDate() - daysBack);
  lastTue.setHours(0, 0, 0, 0);
  return new Date(vocabTestDate) >= lastTue;
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

const FILTER_STORAGE_KEY = "mentoring-list-filters";

type CancelFilter = "exclude" | "only" | "all";

// 클라이언트에서만 유지하는 필터(즉시 적용). 날짜 범위는 URL 로 이동.
type FilterState = {
  mentor: string;
  q: string;
  cancel?: CancelFilter;
};

function loadFilters(): Partial<FilterState> {
  try { return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

function saveFilters(f: FilterState) {
  try { sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

export function MentoringList({ mentorings, mentors, isDirector, currentUserId, checkedInStudentIds = [], vocabEnrolledStudentIds = [], attendanceNotes = {}, meritPoints = {}, initialDateFrom, initialDateTo }: Props) {
  const router = useRouter();
  const checkedInSet = new Set(checkedInStudentIds);
  const vocabEnrolledSet = new Set(vocabEnrolledStudentIds);
  const today = getToday();

  // sessionStorage에서 필터 복원, 없으면 현재 로그인 사용자로 기본 필터
  const saved = typeof window !== "undefined" ? loadFilters() : {};
  const hasSavedMentor = typeof window !== "undefined" && sessionStorage.getItem(FILTER_STORAGE_KEY) !== null;
  const defaultMentor = hasSavedMentor ? (saved.mentor ?? "all") : (currentUserId || "all");

  const [selectedMentorId, setSelectedMentorId] = useState<string>(defaultMentor);
  // 날짜는 URL(?from=&to=) → initialDateFrom/To 로 들어옴. 입력은 staged 상태로 변경하고 "조회" 클릭 시 navigate.
  const [dateFrom, setDateFrom] = useState<string>(initialDateFrom);
  const [dateTo, setDateTo] = useState<string>(initialDateTo);
  const [isRefetching, startRefetching] = useTransition();
  const [query, setQuery] = useState(saved.q ?? "");
  const [cancelFilter, setCancelFilter] = useState<CancelFilter>(saved.cancel ?? "exclude");
  const [page, setPage] = useState(0);

  // URL 이 바뀌어 초기값이 갱신되면 staged 입력도 동기화
  useEffect(() => {
    setDateFrom(initialDateFrom);
    setDateTo(initialDateTo);
  }, [initialDateFrom, initialDateTo]);

  const datesDirty = dateFrom !== initialDateFrom || dateTo !== initialDateTo;
  function applyDateRange(from: string, to: string) {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    startRefetching(() => {
      router.push(qs ? `/mentoring?${qs}` : "/mentoring");
    });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Mentoring | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // 학부모 리포트 인라인 패널 열린 멘토링 ID (한 번에 하나만 펼침)
  const [parentReportOpenId, setParentReportOpenId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResults, setBulkResults] = useState<Record<string, "pending" | "created" | "existing" | "failed">>({});
  const [showOnlyWithReport, setShowOnlyWithReport] = useState(false);
  const [isBulkPending, startBulkTransition] = useTransition();
  // 메모 인라인 편집: 클릭한 행만 textarea, 다른 행은 텍스트만.
  const [notesEditingId, setNotesEditingId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  // 서버 revalidate 가 props 를 갱신하기 전까지 화면을 안 깜빡이게 로컬 오버라이드.
  const [notesOverride, setNotesOverride] = useState<Record<string, string | null>>({});
  const [, startNotesTransition] = useTransition();

  function startNotesEdit(m: Mentoring) {
    setNotesEditingId(m.id);
    setNotesDraft(notesOverride[m.id] ?? m.notes ?? "");
  }

  function commitNotes(id: string, original: string) {
    const next = notesDraft.trim();
    setNotesEditingId(null);
    if (next === original.trim()) return; // 변경 없으면 호출 생략
    setNotesOverride((prev) => ({ ...prev, [id]: next.length > 0 ? next : null }));
    startNotesTransition(async () => {
      try {
        await updateMentoringNotes(id, next);
      } catch {
        toast.error("메모 저장 실패");
        setNotesOverride((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }
    });
  }

  // 필터 변경 시 sessionStorage에 저장(날짜는 URL 소관이라 제외)
  useEffect(() => {
    saveFilters({ mentor: selectedMentorId, q: query, cancel: cancelFilter });
  }, [selectedMentorId, query, cancelFilter]);

  // 클라이언트 필터가 바뀌면 첫 페이지로 리셋
  useEffect(() => {
    setPage(0);
  }, [selectedMentorId, query, cancelFilter, showOnlyWithReport, initialDateFrom, initialDateTo]);

  const q = query.trim().toLowerCase();
  const baseFiltered = mentorings.filter((m) => {
    // 취소 필터 (클라이언트 — URL 이동 없이 즉시 적용). 날짜는 서버에서 이미 잘림.
    if (cancelFilter === "exclude" && m.status === "CANCELLED") return false;
    if (cancelFilter === "only" && m.status !== "CANCELLED") return false;
    if (selectedMentorId !== "all" && m.mentor.id !== selectedMentorId) return false;
    if (q && !m.student.name.toLowerCase().includes(q)) return false;
    if (showOnlyWithReport && !(m.parentReports && m.parentReports.length > 0)) return false;
    return true;
  });

  // 헤더 클릭으로 정렬 (3-state 토글). 미정렬 시 서버 순서(scheduledAt desc) 유지.
  const { rows: filtered, sort, toggle } = useSortableTable(baseFiltered, {
    scheduledAt: (m) => new Date(m.scheduledAt).getTime(),
    studentName: (m) => m.student.name,
    mentorName: (m) => m.mentor.name,
    time: (m) => m.scheduledTimeStart ?? "",
    status: (m) => m.status,
  });

  const filteredIds = filtered.map((m) => m.id);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const visibleRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleIds = visibleRows.map((m) => m.id);

  // 전체선택은 "현재 페이지" 기준. 다른 페이지의 선택은 유지.
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));
  const selectedCount = filteredIds.filter((id) => selected.has(id)).length;
  const headerCheckState: boolean | "indeterminate" =
    allSelected ? true : someSelected ? "indeterminate" : false;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...visibleIds]));
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

  async function handleBulkCreateReports() {
    const targets = filteredIds.filter((id) => selected.has(id));
    if (targets.length === 0) return;
    const initial: Record<string, "pending"> = {};
    for (const id of targets) initial[id] = "pending";
    setBulkResults(initial);
    setBulkGenerating(true);
    try {
      const results: BulkParentReportResult[] = await createParentReportsBulk(targets);
      const next: Record<string, "created" | "existing" | "failed"> = {};
      let created = 0, existing = 0, failed = 0;
      for (const r of results) {
        next[r.mentoringId] = r.status;
        if (r.status === "created") created++;
        else if (r.status === "existing") existing++;
        else failed++;
      }
      setBulkResults(next);
      toast.success(
        `생성 ${created}건 · 기존 ${existing}건${failed > 0 ? ` · 실패 ${failed}건` : ""}`
      );
      // 자동으로 "생성된 리포트만 보기" 필터 활성화해서 검토 단계로 이동
      setShowOnlyWithReport(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 실패");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleBulkShare() {
    const targets = filteredIds
      .filter((id) => selected.has(id))
      .map((id) => mentorings.find((m) => m.id === id))
      .filter((m): m is Mentoring => !!m && !!m.parentReports?.[0]);
    if (targets.length === 0) {
      toast.error("공유할 리포트가 없습니다 (선택 중 학부모 리포트 없는 건)");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const lines = targets.map((m) => {
      const token = m.parentReports![0].token;
      return `${m.student.name} ${m.student.grade} — ${origin}/r/${token}`;
    });
    const text = `${targets.length}건의 학부모 리포트 링크\n\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${targets.length}건 링크 복사됨`);
    } catch {
      toast.error("복사 실패 — 브라우저 권한 확인");
    }
  }

  return (
    <div className="space-y-3">
      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {mentors.length > 0 && (
          <>
            <span className="text-sm text-muted-foreground">담당 멘토</span>
            <Combobox
              value={selectedMentorId === "all" ? "" : selectedMentorId}
              onChange={(v) => setSelectedMentorId(v || "all")}
              items={mentors.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="전체"
              searchPlaceholder="멘토 이름 검색…"
              allowEmpty
              emptyLabel="전체"
              triggerClassName="w-36 h-8 text-sm"
            />
          </>
        )}
        <span className="text-sm text-muted-foreground">날짜</span>
        <DatePicker value={dateFrom || null} onChange={(d) => setDateFrom(d ?? "")} placeholder="시작" />
        <span className="text-sm text-muted-foreground">~</span>
        <DatePicker value={dateTo || null} onChange={(d) => setDateTo(d ?? "")} placeholder="종료" />
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => applyDateRange(dateFrom, dateTo)}
          disabled={isRefetching || (!datesDirty && filtered.length > 0)}
          title={datesDirty ? "변경된 날짜로 조회" : "현재 범위로 다시 조회"}
        >
          {isRefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          조회
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => applyDateRange(today, today)}
          disabled={isRefetching}
        >
          오늘만
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => applyDateRange("", "")}
          disabled={isRefetching}
        >
          기본 범위
        </Button>
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
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none ml-2">
          <input
            type="checkbox"
            checked={showOnlyWithReport}
            onChange={(e) => setShowOnlyWithReport(e.target.checked)}
            className="rounded h-3 w-3"
          />
          <Filter className="h-3 w-3" />
          리포트 있는 것만
        </label>
        <div className="inline-flex items-center rounded-full border bg-background p-0.5" role="group" aria-label="취소 필터">
          {([
            { key: "exclude", label: "취소 제외" },
            { key: "only", label: "취소만" },
            { key: "all", label: "전체" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setCancelFilter(opt.key)}
              aria-pressed={cancelFilter === opt.key}
              className={
                "h-6 px-2.5 text-[11px] rounded-full transition-colors " +
                (cancelFilter === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleBulkCreateReports}
                disabled={bulkGenerating}
              >
                {bulkGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {selectedCount}건 리포트 생성
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                onClick={handleBulkShare}
              >
                <Send className="h-3.5 w-3.5" />
                링크 복사
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {selectedCount}건 삭제
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalCount > 0
              ? `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalCount)} / ${totalCount}건`
              : "0건"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 px-2">
                <label
                  className="flex items-center gap-1.5 cursor-pointer select-none rounded px-1 py-1 -mx-1 -my-1 hover:bg-muted/60 transition-colors"
                  title={allSelected ? "현재 페이지 전체 해제" : "현재 페이지 전체 선택"}
                >
                  <Checkbox
                    checked={headerCheckState}
                    onCheckedChange={toggleAll}
                    aria-label="현재 페이지 전체 선택"
                    className="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                  />
                  <span className="text-[11px] font-medium text-muted-foreground">전체</span>
                </label>
              </TableHead>
              <TableHead className="w-10 text-center">좌석</TableHead>
              <SortableHeader sortKey="scheduledAt" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="h-10 px-2 whitespace-nowrap">
                예정일
              </SortableHeader>
              <SortableHeader sortKey="studentName" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="h-10 px-2 whitespace-nowrap">
                원생
              </SortableHeader>
              {mentors.length > 0 && (
                <SortableHeader sortKey="mentorName" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="h-10 px-2 whitespace-nowrap">
                  멘토
                </SortableHeader>
              )}
              <SortableHeader sortKey="time" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="h-10 px-2 whitespace-nowrap">
                시간
              </SortableHeader>
              <SortableHeader sortKey="status" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="h-10 px-2 whitespace-nowrap">
                상태
              </SortableHeader>
              <TableHead>메모</TableHead>
              <TableHead className="whitespace-nowrap text-center">KDA 사진</TableHead>
              <TableHead className="whitespace-nowrap">학부모 리포트</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={mentors.length > 0 ? 11 : 10} className="text-center text-muted-foreground py-8">
                  멘토링 기록이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((m, idx) => (
                <Fragment key={m.id}>
                <TableRow
                  data-state={selected.has(m.id) ? "selected" : undefined}
                  className={vocabEnrolledSet.has(m.student.id) && !isVocabDone(m.student.vocabTestDate) ? "bg-orange-50" : undefined}
                  title={vocabEnrolledSet.has(m.student.id) && !isVocabDone(m.student.vocabTestDate) ? "영단어 시험 미응시" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggleOne(m.id)}
                      aria-label={`${m.student.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">{m.student.seat || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(m.scheduledAt)}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex items-center gap-2 flex-nowrap">
                      {/* 입실 상태 표시 */}
                      {checkedInSet.has(m.student.id) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 shrink-0 whitespace-nowrap">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                          </span>
                          입실
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 shrink-0 whitespace-nowrap">
                          미입실
                        </span>
                      )}
                      {/* 이름 + 학년 */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
                          <span className="font-medium whitespace-nowrap">{m.student.name}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{m.student.grade}</span>
                          {(() => {
                            const p = meritPoints[m.student.id];
                            return p ? <MeritBadge positive={p.positive} negative={p.negative} /> : null;
                          })()}
                          {/* 입퇴실 시간 */}
                          {(() => {
                            const dow = new Date(m.scheduledAt).getDay();
                            const sched = m.student.schedules?.find((s) => s.dayOfWeek === dow);
                            if (!sched) return null;
                            const isCheckedIn = checkedInSet.has(m.student.id);
                            return (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap shrink-0">
                                {isCheckedIn
                                  ? `~${sched.endTime === "FLEXIBLE" ? "자율" : sched.endTime}`
                                  : `${sched.startTime === "FLEXIBLE" ? "자율" : sched.startTime}~${sched.endTime === "FLEXIBLE" ? "자율" : sched.endTime}`}
                              </span>
                            );
                          })()}
                        </div>
                        {/* 특이사항 */}
                        {attendanceNotes[m.student.id] && (
                          <p className="text-[11px] text-amber-600 truncate max-w-[200px] mt-0.5" title={attendanceNotes[m.student.id]}>
                            {attendanceNotes[m.student.id]}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {mentors.length > 0 && <TableCell className="whitespace-nowrap">{m.mentor.name}</TableCell>}
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
                  <TableCell className="max-w-56 align-top">
                    {(() => {
                      const isEditing = notesEditingId === m.id;
                      const current = notesOverride[m.id] !== undefined ? notesOverride[m.id] : m.notes;
                      const isCancelled = m.status === "CANCELLED";
                      if (isEditing) {
                        return (
                          <textarea
                            autoFocus
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            onBlur={() => commitNotes(m.id, current ?? "")}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setNotesEditingId(null);
                              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                commitNotes(m.id, current ?? "");
                              }
                            }}
                            placeholder={isCancelled ? "취소 사유를 입력해주세요" : "메모"}
                            rows={2}
                            className="w-full text-xs rounded border border-blue-300 px-2 py-1 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-background"
                          />
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => startNotesEdit({ ...m, notes: current })}
                          className={cn(
                            "w-full text-left text-sm rounded px-1.5 py-1 -ml-1.5 hover:bg-muted/40 transition-colors line-clamp-2",
                            current ? "text-foreground" : "text-muted-foreground/60",
                            isCancelled && !current && "text-rose-500/80"
                          )}
                          title={current ?? (isCancelled ? "취소 사유를 입력해주세요" : "메모 추가")}
                        >
                          {current || (isCancelled ? "취소 사유 입력" : "—")}
                        </button>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const photoCount = m._count?.photos ?? 0;
                      return photoCount > 0 ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700 gap-1">
                          <Camera className="h-3 w-3" />
                          제출 완료 {photoCount}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-gray-300 text-muted-foreground gap-1">
                          <Camera className="h-3 w-3" />
                          미제출
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {(() => {
                      const pr = m.parentReports?.[0];
                      const isOpen = parentReportOpenId === m.id;
                      const bulk = bulkResults[m.id];
                      return (
                        <div className="flex items-center gap-1 flex-nowrap">
                          {bulk === "pending" && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              생성 중
                            </Badge>
                          )}
                          {bulk === "failed" && (
                            <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">실패</Badge>
                          )}
                          {!bulk && pr && (
                            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              생성됨
                            </Badge>
                          )}
                          {bulk === "created" && (
                            <Badge variant="outline" className="text-[10px] border-emerald-500 bg-emerald-50 text-emerald-700 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              방금 생성
                            </Badge>
                          )}
                          {bulk === "existing" && (
                            <Badge variant="outline" className="text-[10px] border-gray-300 text-muted-foreground">기존</Badge>
                          )}
                          <Button
                            size="sm"
                            variant={isOpen ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={() => setParentReportOpenId(isOpen ? null : m.id)}
                          >
                            {isOpen ? <ChevronDown className="h-3 w-3 mr-0.5" /> : <ChevronRight className="h-3 w-3 mr-0.5" />}
                            <Link2 className="h-3 w-3 mr-1" />
                            {pr ? "관리" : "생성"}
                          </Button>
                          {pr && (
                            <a
                              href={`/r/${pr.token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-muted-foreground hover:text-foreground"
                              title="학부모 화면 열기"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })()}
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
                {parentReportOpenId === m.id && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={mentors.length > 0 ? 11 : 10} className="p-3">
                      <ParentReportInlinePanel
                        mentoringId={m.id}
                        studentName={m.student.name}
                        mentoringDate={formatDate(m.scheduledAt)}
                        existingToken={m.parentReports?.[0]?.token ?? null}
                        onClose={() => setParentReportOpenId(null)}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            페이지 {currentPage + 1} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(0)}
              disabled={currentPage === 0}
              aria-label="첫 페이지"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              aria-label="마지막 페이지"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

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
