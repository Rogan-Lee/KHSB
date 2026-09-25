"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, X, Link2, ExternalLink, CheckCircle2, ChevronDown, ChevronRight, Send, Loader2, Camera, ChevronLeft, ChevronsLeft, ChevronsRight, RefreshCw, ClipboardList } from "lucide-react";
import { ParentReportInlinePanel } from "./parent-report-inline-panel";
import { DatePicker } from "@/components/ui/date-picker";
import { updateMentoringStatus, updateMentoringNotes, deleteMentoring, bulkDeleteMentorings } from "@/actions/mentoring";
import { createParentReportsBulk, type BulkParentReportResult } from "@/actions/parent-reports";
import { toast } from "sonner";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { EmptyState, FilterChip, SearchField, Segmented, StatusBadge, TableCard, Toolbar } from "@/components/backoffice/ui";
import { inputBaseClass } from "@/components/ui/input";
import { MENTORING_STATUS, MentoringStatusBadge, TH_CLASS, type MentoringStatusKey } from "./mentoring-status";
import { ConfirmDialog } from "./confirm-dialog";

const STATUS_MAP = MENTORING_STATUS;

type Mentoring = {
  id: string;
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: MentoringStatusKey;
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
  tardyStudentIds?: string[];
  /** 이달 기준 학생별 상/벌점 누적 (§2.17) */
  meritPoints?: Record<string, { positive: number; negative: number }>;
  /** 서버 측 조회 범위(URL ?from=&to=). 클라이언트는 표시만 하고 변경 시 navigate. */
  initialDateFrom: string;
  initialDateTo: string;
};

const PAGE_SIZE = 20;

/** 이달 상벌점 임계값을 넘으면 표시 (§2.17). 임계값: 상점 10↑ / 벌점 15↑ */
function MeritBadge({ positive, negative }: { positive: number; negative: number }) {
  if (positive < 10 && negative < 15) return null;
  return (
    <>
      {positive >= 10 && (
        <span title={`이달 상점 ${positive}점`}>
          <StatusBadge tone="ok">상점 {positive}</StatusBadge>
        </span>
      )}
      {negative >= 15 && (
        <span title={`이달 벌점 ${negative}점`}>
          <StatusBadge tone="bad">벌점 {negative}</StatusBadge>
        </span>
      )}
    </>
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
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="멘토링 삭제"
      description={`${mentoring.student.name}의 ${formatDate(mentoring.scheduledAt)} 멘토링을 삭제할까요?\n삭제한 기록은 되돌릴 수 없어요.`}
      pending={isPending}
      onConfirm={handleDelete}
    />
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
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={`멘토링 ${count}건 삭제`}
      description={`선택한 멘토링 ${count}건을 삭제할까요?\n삭제한 기록은 되돌릴 수 없어요.`}
      confirmLabel={`${count}건 삭제`}
      pending={isPending}
      onConfirm={onConfirm}
    />
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
        <Button variant="ghost" size="icon" className="size-8" disabled={isPending} aria-label="더보기">
          <MoreHorizontal />
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
          className="text-fg-critical focus:text-fg-critical"
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

export function MentoringList({ mentorings, mentors, isDirector, currentUserId, checkedInStudentIds = [], vocabEnrolledStudentIds = [], attendanceNotes = {}, tardyStudentIds = [], meritPoints = {}, initialDateFrom, initialDateTo }: Props) {
  const router = useRouter();
  const checkedInSet = new Set(checkedInStudentIds);
  const tardySet = new Set(tardyStudentIds);
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
  // 날짜 미지정(빈 값) = 전체 기간(서버 필터 없음)
  const isAllRange = !initialDateFrom && !initialDateTo;
  function applyDateRange(from: string, to: string) {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    startRefetching(() => {
      router.push(qs ? `/mentoring?${qs}` : "/mentoring");
    });
  }
  // "최근 1주일" 프리셋: 오늘 기준 -7일 ~ +14일
  function applyRecentRange() {
    const n = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const from = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 7);
    const to = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 14);
    applyDateRange(iso(from), iso(to));
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

  const colCount = mentors.length > 0 ? 11 : 10;
  const isTodayRange = initialDateFrom === today && initialDateTo === today;

  return (
    <div>
      {/* 필터 — 원생·멘토·취소·리포트 (즉시 적용) */}
      <Toolbar className="mb-x3">
        <div className="relative w-full sm:w-60">
          <SearchField
            placeholder="원생 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="원생 이름 검색"
            className="pr-x8 sm:w-60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-fg-neutral-subtle hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {mentors.length > 0 && (
          <Combobox
            value={selectedMentorId === "all" ? "" : selectedMentorId}
            onChange={(v) => setSelectedMentorId(v || "all")}
            items={mentors.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="멘토 전체"
            searchPlaceholder="멘토 이름 검색…"
            allowEmpty
            emptyLabel="전체"
            triggerClassName="w-40"
          />
        )}
        <Segmented
          aria-label="취소 필터"
          value={cancelFilter}
          onChange={(v) => setCancelFilter(v)}
          options={[
            { value: "exclude", label: "취소 제외" },
            { value: "only", label: "취소만" },
            { value: "all", label: "전체" },
          ]}
          className="w-auto"
        />
        <FilterChip selected={showOnlyWithReport} onClick={() => setShowOnlyWithReport(!showOnlyWithReport)}>
          리포트 있는 것만
        </FilterChip>
      </Toolbar>

      {/* 조회 기간 — 서버 조회(URL) */}
      <Toolbar>
        <span className="t4-medium text-fg-neutral-muted">기간</span>
        <DatePicker value={dateFrom || null} onChange={(d) => setDateFrom(d ?? "")} placeholder="시작일" className="h-9 px-x3" />
        <span className="t4-regular text-fg-neutral-subtle">~</span>
        <DatePicker value={dateTo || null} onChange={(d) => setDateTo(d ?? "")} placeholder="종료일" className="h-9 px-x3" />
        <Button
          type="button"
          size="sm"
          variant={datesDirty ? "default" : "outline"}
          onClick={() => applyDateRange(dateFrom, dateTo)}
          disabled={isRefetching || (!datesDirty && filtered.length > 0)}
          title={datesDirty ? "변경된 날짜로 조회" : "현재 범위로 다시 조회"}
        >
          {isRefetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {isRefetching ? "조회 중…" : "조회"}
        </Button>
        <div className="flex flex-wrap items-center gap-x1_5">
          <FilterChip selected={isTodayRange} onClick={() => applyDateRange(today, today)} disabled={isRefetching}>
            오늘
          </FilterChip>
          <FilterChip onClick={applyRecentRange} disabled={isRefetching}>
            최근 1주일
          </FilterChip>
          <FilterChip
            selected={isAllRange}
            onClick={() => applyDateRange("", "")}
            disabled={isRefetching}
            title="전체 기간 조회 (기본값)"
          >
            전체 기간
          </FilterChip>
        </div>
        <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
          {totalCount > 0
            ? `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalCount)} / ${totalCount}건`
            : "0건"}
        </span>
      </Toolbar>

      {/* 선택 작업 */}
      {selectedCount > 0 && (
        <div className="mb-x3 flex flex-wrap items-center gap-x2 rounded-r4 bg-bg-layer-fill px-x4 py-x2_5">
          <span className="t4-bold tabular-nums text-fg-neutral">{selectedCount}건 선택됨</span>
          <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-x2">
            <Button size="sm" onClick={handleBulkCreateReports} disabled={bulkGenerating}>
              {bulkGenerating ? <Loader2 className="animate-spin" /> : <Link2 />}
              {bulkGenerating ? "생성 중…" : `${selectedCount}건 리포트 생성`}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkShare}>
              <Send />
              링크 복사
            </Button>
            <Button size="sm" variant="ghost" className="text-fg-critical" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 />
              {selectedCount}건 삭제
            </Button>
          </div>
        </div>
      )}

      <TableCard
        footer={
          totalCount > PAGE_SIZE ? (
            <>
              <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                페이지 {currentPage + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-x1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setPage(0)} disabled={currentPage === 0} aria-label="첫 페이지">
                  <ChevronsLeft />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} aria-label="이전 페이지">
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} aria-label="다음 페이지">
                  <ChevronRight />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setPage(totalPages - 1)} disabled={currentPage >= totalPages - 1} aria-label="마지막 페이지">
                  <ChevronsRight />
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pr-0">
                <Checkbox
                  checked={headerCheckState}
                  onCheckedChange={toggleAll}
                  aria-label="현재 페이지 전체 선택"
                  title={allSelected ? "현재 페이지 전체 해제" : "현재 페이지 전체 선택"}
                />
              </TableHead>
              <TableHead className="w-14 text-center">좌석</TableHead>
              <SortableHeader sortKey="scheduledAt" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                예정일
              </SortableHeader>
              <SortableHeader sortKey="studentName" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                원생
              </SortableHeader>
              {mentors.length > 0 && (
                <SortableHeader sortKey="mentorName" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                  멘토
                </SortableHeader>
              )}
              <SortableHeader sortKey="time" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                시간
              </SortableHeader>
              <SortableHeader sortKey="status" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={TH_CLASS}>
                상태
              </SortableHeader>
              <TableHead>메모</TableHead>
              <TableHead className="text-center">KDA 사진</TableHead>
              <TableHead>학부모 리포트</TableHead>
              <TableHead><span className="sr-only">작업</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="p-0">
                  {mentorings.length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      title={isAllRange ? "아직 등록된 멘토링이 없어요" : "이 기간에 멘토링이 없어요"}
                      description={isAllRange ? "멘토링 일정을 등록하면 여기에서 기록을 관리할 수 있어요" : "기간을 바꾸거나 전체 기간으로 조회해 보세요"}
                      action={
                        <Button asChild size="sm">
                          <Link href="/mentoring/new">멘토링 등록</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      title="조건에 맞는 멘토링이 없어요"
                      description="검색어나 멘토·취소·리포트 필터를 바꿔 보세요"
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((m) => {
                const vocabMissed = vocabEnrolledSet.has(m.student.id) && !isVocabDone(m.student.vocabTestDate);
                return (
                <Fragment key={m.id}>
                <TableRow
                  data-state={selected.has(m.id) ? "selected" : undefined}
                  title={vocabMissed ? "영단어 시험 미응시" : undefined}
                >
                  <TableCell className="pr-0">
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggleOne(m.id)}
                      aria-label={`${m.student.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className="text-center t3-regular tabular-nums text-fg-neutral-subtle">{m.student.seat || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDate(m.scheduledAt)}</TableCell>
                  <TableCell className="min-w-[240px]">
                    <div className="flex flex-nowrap items-center gap-x2">
                      {/* 입실 상태 */}
                      {checkedInSet.has(m.student.id) ? (
                        <StatusBadge tone="ok" className="gap-x1">
                          <span className="relative flex size-1.5" aria-hidden>
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg-positive-solid opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-bg-positive-solid" />
                          </span>
                          입실
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="gray">미입실</StatusBadge>
                      )}
                      {/* 이름 + 학년 */}
                      <div className="min-w-0">
                        <div className="flex flex-nowrap items-center gap-x1_5 whitespace-nowrap">
                          <Link
                            href={`/mentoring/${m.id}`}
                            className="t4-bold text-fg-neutral underline-offset-4 hover:underline"
                          >
                            {m.student.name}
                          </Link>
                          <span className="t3-regular text-fg-neutral-subtle">{m.student.grade}</span>
                          {(() => {
                            const p = meritPoints[m.student.id];
                            return p ? <MeritBadge positive={p.positive} negative={p.negative} /> : null;
                          })()}
                          {vocabMissed && <StatusBadge tone="warn">단어 미응시</StatusBadge>}
                          {/* 입퇴실 시간 */}
                          {(() => {
                            const dow = new Date(m.scheduledAt).getDay();
                            const sched = m.student.schedules?.find((s) => s.dayOfWeek === dow);
                            if (!sched) return null;
                            const isCheckedIn = checkedInSet.has(m.student.id);
                            return (
                              <span className="shrink-0 whitespace-nowrap rounded-r1 bg-bg-neutral-weak px-x1_5 py-x0_5 t2-medium tabular-nums text-fg-neutral-muted">
                                {isCheckedIn
                                  ? `~${sched.endTime === "FLEXIBLE" ? "자율" : sched.endTime}`
                                  : `${sched.startTime === "FLEXIBLE" ? "자율" : sched.startTime}~${sched.endTime === "FLEXIBLE" ? "자율" : sched.endTime}`}
                              </span>
                            );
                          })()}
                        </div>
                        {/* 입퇴실 특이사항 · 지연입실 */}
                        {(tardySet.has(m.student.id) || attendanceNotes[m.student.id]) && (
                          <p className="mt-x0_5 flex max-w-[240px] items-center gap-x1 t3-regular text-fg-warning" title={attendanceNotes[m.student.id]}>
                            {tardySet.has(m.student.id) && <StatusBadge tone="warn">지연입실</StatusBadge>}
                            <span className="truncate">{attendanceNotes[m.student.id]}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {mentors.length > 0 && <TableCell className="whitespace-nowrap">{m.mentor.name}</TableCell>}
                  <TableCell className="whitespace-nowrap t3-regular tabular-nums text-fg-neutral-muted">
                    {m.scheduledTimeStart && m.scheduledTimeEnd
                      ? `${m.scheduledTimeStart}~${m.scheduledTimeEnd}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <MentoringStatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="min-w-40 max-w-56">
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
                            className={cn(inputBaseClass, "resize-y px-x2 py-x1_5 t3-regular")}
                          />
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => startNotesEdit({ ...m, notes: current })}
                          className={cn(
                            "-ml-1.5 line-clamp-2 w-full rounded-r1 px-x1_5 py-x1 text-left t3-regular transition-colors hover:bg-bg-transparent-pressed",
                            current ? "text-fg-neutral" : "text-fg-placeholder",
                            isCancelled && !current && "text-fg-critical"
                          )}
                          title={current ?? (isCancelled ? "취소 사유를 입력해주세요" : "메모 추가")}
                        >
                          {current || (isCancelled ? "취소 사유 입력" : "메모 추가")}
                        </button>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const photoCount = m._count?.photos ?? 0;
                      return photoCount > 0 ? (
                        <StatusBadge tone="ok">
                          <Camera />
                          제출 {photoCount}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="gray">
                          <Camera />
                          미제출
                        </StatusBadge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {(() => {
                      const pr = m.parentReports?.[0];
                      const isOpen = parentReportOpenId === m.id;
                      const bulk = bulkResults[m.id];
                      return (
                        <div className="flex flex-nowrap items-center gap-x1_5">
                          {bulk === "pending" && (
                            <StatusBadge tone="info">
                              <Loader2 className="animate-spin" />
                              생성 중
                            </StatusBadge>
                          )}
                          {bulk === "failed" && <StatusBadge tone="bad">실패</StatusBadge>}
                          {!bulk && pr && (
                            <StatusBadge tone="ok">
                              <CheckCircle2 />
                              생성됨
                            </StatusBadge>
                          )}
                          {bulk === "created" && (
                            <StatusBadge tone="ok" solid>
                              <CheckCircle2 />
                              방금 생성
                            </StatusBadge>
                          )}
                          {bulk === "existing" && <StatusBadge tone="gray">기존</StatusBadge>}
                          <Button
                            size="xs"
                            variant={isOpen ? "ink" : "outline"}
                            onClick={() => setParentReportOpenId(isOpen ? null : m.id)}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown /> : <ChevronRight />}
                            {pr ? "관리" : "생성"}
                          </Button>
                          {pr && (
                            <a
                              href={`/r/${pr.token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                              title="학부모 화면 열기"
                              aria-label="학부모 화면 열기"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-x1">
                      <Button asChild size="xs" variant={m.status === "SCHEDULED" ? "default" : "soft"}>
                        <Link href={`/mentoring/${m.id}`}>
                          {m.status === "SCHEDULED" ? "기록 작성" : "기록 보기"}
                        </Link>
                      </Button>
                      <KebabMenu
                        mentoring={m}
                        onDelete={() => setDeleteTarget(m)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {parentReportOpenId === m.id && (
                  <TableRow className="bg-bg-layer-fill hover:bg-bg-layer-fill">
                    <TableCell colSpan={colCount} className="p-x4">
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
                );
              })
            )}
          </TableBody>
        </Table>
      </TableCard>

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
