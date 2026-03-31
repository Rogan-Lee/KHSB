"use client";

import { useState, useTransition, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { updateConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, X, Pencil, CheckCircle, XCircle, CalendarDays, MessageSquare, ClipboardList, Play, ChevronDown, ChevronUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";

type Status = "SCHEDULED" | "COMPLETED" | "CANCELLED";

const STATUS_CONFIG: Record<Status, {
  label: string;
  bar: string;
  badge: string;
}> = {
  SCHEDULED: {
    label: "예정",
    bar: "bg-blue-400",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  COMPLETED: {
    label: "완료",
    bar: "bg-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "취소",
    bar: "bg-gray-300",
    badge: "bg-gray-50 text-gray-500 border-gray-200",
  },
};

type Consultation = {
  id: string;
  scheduledAt: Date | null;
  actualDate?: Date | null;
  status: Status;
  agenda: string | null;
  notes?: string | null;
  outcome: string | null;
  followUp: string | null;
  type?: "STUDENT" | "PARENT" | null;
  category?: "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING" | null;
  student: { id: string; name: string; grade: string } | null;
  prospectName?: string | null;
  prospectGrade?: string | null;
};

const TYPE_LABEL: Record<string, string> = { STUDENT: "학생", PARENT: "학부모" };
const CATEGORY_LABEL: Record<string, { label: string; style: string }> = {
  ENROLLED: { label: "재원생", style: "bg-blue-50 text-blue-700 border-blue-200" },
  NEW_ADMISSION: { label: "신규 입실", style: "bg-green-50 text-green-700 border-green-200" },
  CONSIDERING: { label: "등록 고민", style: "bg-amber-50 text-amber-700 border-amber-200" },
};

function formatKST(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = dayNames[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const timeStr = hh === "00" && mm === "00" ? "" : ` ${hh}:${mm}`;
  return `${m}월 ${d}일 (${dow})${timeStr}`;
}

// ─── Consultation Card ────────────────────────────────────────────────────────

function ConsultationCard({
  c,
  isPending,
  onQuickStatus,
  onNavigate,
}: {
  c: Consultation;
  isPending: boolean;
  onQuickStatus: (status: "COMPLETED" | "CANCELLED") => void;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[c.status];
  const hasContent = !!(c.agenda || c.outcome || c.followUp || c.notes);

  return (
    <div className={cn(
      "group flex gap-0 rounded-xl border bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md",
      c.status === "CANCELLED" && "opacity-60"
    )}>
      {/* Status bar */}
      <div className={cn("w-1 shrink-0", cfg.bar)} />

      {/* Content */}
      <div className="flex-1 px-4 py-3 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-semibold text-sm">{c.student?.name ?? c.prospectName ?? "—"}</span>
            {(c.student?.grade || c.prospectGrade) && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">{c.student?.grade ?? c.prospectGrade}</span>
            )}
            {c.type && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                {TYPE_LABEL[c.type] ?? c.type}
              </span>
            )}
            {c.category && CATEGORY_LABEL[c.category] && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", CATEGORY_LABEL[c.category].style)}>
                {CATEGORY_LABEL[c.category].label}
              </span>
            )}
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.badge)}>
              {cfg.label}
            </span>
          </div>
          {/* Actions — visible on hover */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {c.status === "SCHEDULED" && (
              <>
                <button onClick={onNavigate} disabled={isPending} title="면담 진행"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors disabled:opacity-40">
                  <Play className="h-3.5 w-3.5" />진행
                </button>
                <button onClick={() => onQuickStatus("COMPLETED")} disabled={isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-40">
                  <CheckCircle className="h-3.5 w-3.5" />완료
                </button>
                <button onClick={() => onQuickStatus("CANCELLED")} disabled={isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-40">
                  <XCircle className="h-3.5 w-3.5" />취소
                </button>
              </>
            )}
            <button onClick={onNavigate} title="수정"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Meta row */}
        {c.scheduledAt && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <CalendarDays className="h-3 w-3" />
            {formatKST(c.scheduledAt)}
          </p>
        )}

        {/* Preview (collapsed) */}
        {!expanded && hasContent && (
          <div className="mt-2 space-y-1">
            {c.agenda && (
              <p className="flex items-start gap-1.5 text-xs text-foreground/80">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-1">{c.agenda}</span>
              </p>
            )}
          </div>
        )}

        {/* Expanded — 마크다운 렌더링 */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {c.agenda && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">면담 주제</p>
                <MarkdownViewer source={c.agenda} className="text-sm" />
              </div>
            )}
            {c.outcome && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">결과</p>
                <MarkdownViewer source={c.outcome} className="text-sm" />
              </div>
            )}
            {c.followUp && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">사후조치</p>
                <MarkdownViewer source={c.followUp} className="text-sm" />
              </div>
            )}
            {c.notes && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">메모</p>
                <MarkdownViewer source={c.notes} className="text-sm" />
              </div>
            )}
          </div>
        )}

        {/* Toggle */}
        {hasContent && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "접기" : "내용 보기"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main List ────────────────────────────────────────────────────────────────

const CONSULT_FILTER_KEY = "consultations-list-filters";
function loadConsultFilters() {
  try { return JSON.parse(sessionStorage.getItem(CONSULT_FILTER_KEY) ?? "{}"); } catch { return {}; }
}

type CategoryFilter = "ALL" | "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING";
type TypeFilter = "ALL" | "STUDENT" | "PARENT";

export function ConsultationsList({ consultations }: { consultations: Consultation[] }) {
  const router = useRouter();
  const saved = typeof window !== "undefined" ? loadConsultFilters() : {};
  const [query, setQuery] = useState<string>(saved.q ?? "");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">(saved.status ?? "ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(saved.category ?? "ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(saved.type ?? "ALL");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try { sessionStorage.setItem(CONSULT_FILTER_KEY, JSON.stringify({ q: query, status: statusFilter, category: categoryFilter, type: typeFilter })); } catch {}
  }, [query, statusFilter, categoryFilter, typeFilter]);

  const q = query.trim().toLowerCase();

  const filtered = consultations.filter((c) => {
    const name = c.student?.name ?? c.prospectName ?? "";
    const grade = c.student?.grade ?? c.prospectGrade ?? "";
    const matchesQuery = !q || name.toLowerCase().includes(q) || grade.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    const matchesCategory = categoryFilter === "ALL" || c.category === categoryFilter;
    const matchesType = typeFilter === "ALL" || c.type === typeFilter;
    return matchesQuery && matchesStatus && matchesCategory && matchesType;
  });

  function quickStatus(id: string, status: "COMPLETED" | "CANCELLED") {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("status", status);
        await updateConsultation(id, fd);
        toast.success(status === "COMPLETED" ? "완료 처리되었습니다" : "취소 처리되었습니다");
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  const statusTabs: { key: Status | "ALL"; label: string }[] = [
    { key: "ALL", label: "전체" },
    { key: "SCHEDULED", label: "예정" },
    { key: "COMPLETED", label: "완료" },
    { key: "CANCELLED", label: "취소" },
  ];
  const categoryTabs: { key: CategoryFilter; label: string }[] = [
    { key: "ALL", label: "전체" },
    { key: "ENROLLED", label: "재원생" },
    { key: "NEW_ADMISSION", label: "신규 입실" },
    { key: "CONSIDERING", label: "등록 고민" },
  ];
  const typeTabs: { key: TypeFilter; label: string }[] = [
    { key: "ALL", label: "전체" },
    { key: "STUDENT", label: "학생" },
    { key: "PARENT", label: "학부모" },
  ];

  // 등록 고민 추적용 통계
  const consideringCount = consultations.filter((c) => c.category === "CONSIDERING" && c.status !== "CANCELLED").length;

  return (
    <div className="space-y-3">
      {/* 등록 고민 추적 배너 */}
      {consideringCount > 0 && categoryFilter !== "CONSIDERING" && (
        <button
          onClick={() => { setCategoryFilter("CONSIDERING"); setStatusFilter("ALL"); }}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          <span className="text-sm text-amber-800 font-medium">
            등록 고민 중인 상담 {consideringCount}건 — 전환 유도가 필요합니다
          </span>
          <span className="text-xs text-amber-600">보기 →</span>
        </button>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border">
          {statusTabs.map((t) => (
            <button key={t.key} onClick={() => setStatusFilter(t.key)}
              className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                statusFilter === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
              {t.key !== "ALL" && <span className="ml-1 text-[10px] opacity-60">{consultations.filter((c) => c.status === t.key).length}</span>}
            </button>
          ))}
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border">
          {categoryTabs.map((t) => (
            <button key={t.key} onClick={() => setCategoryFilter(t.key)}
              className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                categoryFilter === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Type tabs */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border">
          {typeTabs.map((t) => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)}
              className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                typeFilter === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="원생 검색..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 w-44 text-sm" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}건</span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 rounded-xl border border-dashed">
          <p className="text-sm">{q ? "검색 결과가 없습니다" : "면담 기록이 없습니다"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ConsultationCard
              key={c.id}
              c={c}
              isPending={isPending}
              onQuickStatus={(status) => quickStatus(c.id, status)}
              onNavigate={() => router.push(`/consultations/${c.id}`)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
