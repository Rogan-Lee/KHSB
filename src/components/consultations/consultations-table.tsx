"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, FilterChip, SearchField, StatusBadge, TableCard } from "@/components/backoffice/ui";
import { updateConsultation } from "@/actions/consultations";
import { generateFollowUpMessage } from "@/actions/ai-followup";
import { createConsultationReport } from "@/actions/consultation-reports";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { DateRangeToolbar } from "@/components/ui/date-range-toolbar";
import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import { CATEGORY_META, STATUS_META, TYPE_LABEL, formatKST, type ConsultationStatus } from "./consultation-tones";

type Status = ConsultationStatus;

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

/** AI 팔로업 메시지 진행 상태 — 면담별로 목록 화면에 보관(시트를 닫아도 유지) */
type AiState = { text: string; generated: boolean; reportUrl: string | null };
const AI_INITIAL: AiState = { text: "", generated: false, reportUrl: null };

/** 마크다운 첫 줄을 평문 한 줄로 (목록 미리보기용) */
function firstLine(md: string | null | undefined): string {
  if (!md) return "";
  return (
    md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .split("\n")
      .map((l) => l.replace(/^[\s>#*\-+\d.]+/, "").replace(/[*_`~]/g, "").trim())
      .find(Boolean) ?? ""
  );
}

function displayName(c: Consultation) {
  return c.student?.name ?? c.prospectName ?? "—";
}

// ─── Preview sheet (내용 + AI 팔로업) ─────────────────────────────────────────

function ConsultationPreview({
  c,
  ai,
  setAi,
  isPending,
  onNavigate,
  onComplete,
  onCancel,
}: {
  c: Consultation;
  ai: AiState;
  setAi: (update: (prev: AiState) => AiState) => void;
  isPending: boolean;
  onNavigate: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [isGenerating, startGenerate] = useTransition();
  const [isCreatingReport, startCreateReport] = useTransition();
  const hasContent = !!(c.agenda || c.outcome || c.followUp || c.notes);
  const status = STATUS_META[c.status];
  const category = c.category ? CATEGORY_META[c.category] : null;
  const name = displayName(c);
  const grade = c.student?.grade ?? c.prospectGrade;

  function handleGenerate() {
    startGenerate(async () => {
      try {
        const result = await generateFollowUpMessage(c.id);
        setAi((prev) => ({ ...prev, text: result.message, generated: true }));
      } catch {
        toast.error("메시지 생성 실패");
      }
    });
  }

  function handleCopy() {
    navigator.clipboard.writeText(ai.text);
    toast.success("복사됨");
  }

  const shareText = ai.reportUrl
    ? `안녕하세요, ${c.student?.name ?? c.prospectName ?? ""}님.\n상담 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${ai.reportUrl}`
    : "";

  const sections: { label: string; value: string | null | undefined }[] = [
    { label: "면담 주제", value: c.agenda },
    { label: "결과", value: c.outcome },
    { label: "사후조치", value: c.followUp },
    { label: "메모", value: c.notes },
  ];

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-stroke-neutral-muted px-x6 pb-x5 pt-x6 pr-x14">
        <div className="flex flex-wrap items-center gap-x1_5">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {category && <StatusBadge tone={category.tone}>{category.label}</StatusBadge>}
          {c.type && <StatusBadge tone="gray">{TYPE_LABEL[c.type] ?? c.type}</StatusBadge>}
        </div>
        <SheetTitle className="mt-x2">
          {name}
          {grade && <span className="ml-x2 t5-regular text-fg-neutral-subtle">{grade}</span>}
        </SheetTitle>
        <SheetDescription className="tabular-nums">
          {c.scheduledAt ? `예정 ${formatKST(c.scheduledAt)}` : "예정 일시 미정"}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-x6 overflow-y-auto px-x6 py-x5">
        {hasContent ? (
          <div className="flex flex-col gap-x5">
            {sections.filter((s) => s.value).map((s) => (
              <div key={s.label}>
                <p className="mb-x1_5 t3-medium text-fg-neutral-subtle">{s.label}</p>
                <MarkdownViewer source={s.value!} className="t4-regular" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={ClipboardList}
            title="아직 기록된 내용이 없어요"
            description="면담을 진행하면서 주제와 결과를 기록해 주세요"
          />
        )}

        {/* AI 팔로업 메시지 */}
        {hasContent && (
          <section className="flex flex-col gap-x3 rounded-r4 bg-bg-layer-fill p-x4">
            <div className="flex items-center gap-x2">
              <Sparkles className="size-4 text-palette-purple-600" aria-hidden />
              <h3 className="t4-bold text-fg-neutral">AI 팔로업 메시지</h3>
            </div>

            {!ai.generated && !ai.reportUrl ? (
              <div className="flex flex-col gap-x3 sm:flex-row sm:items-center">
                <p className="flex-1 t3-regular text-fg-neutral-subtle">상담 내용을 바탕으로 팔로업 리포트를 만들어요</p>
                <Button size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? <RefreshCw className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {isGenerating ? "생성 중…" : "생성"}
                </Button>
              </div>
            ) : ai.reportUrl ? (
              /* 리포트 링크 생성 완료 */
              <div className="flex flex-col gap-x3">
                <p className="flex items-center gap-x1_5 t3-medium text-fg-positive">
                  <Link2 className="size-4" aria-hidden />
                  리포트 링크를 만들었어요
                </p>
                <div className="flex gap-x2">
                  <Input value={ai.reportUrl} readOnly aria-label="리포트 링크" className="t3-regular" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="링크 복사"
                    onClick={() => { navigator.clipboard.writeText(ai.reportUrl!); toast.success("링크 복사됨"); }}
                  >
                    <Copy aria-hidden />
                  </Button>
                </div>
                <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-r2 bg-bg-layer-default p-x3 t3-regular text-fg-neutral-muted">
                  {shareText}
                </div>
                <div className="flex gap-x2">
                  {/* 카카오 공식 버튼 색(카카오 브랜드 가이드) — SEED 팔레트 예외 */}
                  <KakaoButton
                    size="sm"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: "강한선배 상담 안내", text: shareText });
                      } else {
                        navigator.clipboard.writeText(shareText);
                        toast.success("메시지가 복사되었습니다");
                      }
                    }}
                    className="flex-1"
                  >
                    카카오톡으로 보내기
                  </KakaoButton>
                  <Button variant="outline" size="sm" onClick={() => setAi(() => AI_INITIAL)}>
                    다시 생성
                  </Button>
                </div>
              </div>
            ) : (
              /* 메시지 편집 → 리포트 생성 */
              <>
                <Textarea
                  value={ai.text}
                  onChange={(e) => { const text = e.target.value; setAi((prev) => ({ ...prev, text })); }}
                  rows={10}
                  aria-label="팔로업 메시지"
                  className="resize-none"
                />
                <div className="flex flex-wrap items-center gap-x2">
                  <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                    <RefreshCw className={cn(isGenerating && "animate-spin")} aria-hidden />
                    재생성
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy aria-hidden />
                    복사
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={!ai.text.trim() || isCreatingReport}
                    onClick={() => {
                      startCreateReport(async () => {
                        try {
                          const { token } = await createConsultationReport(c.id, ai.text);
                          setAi((prev) => ({ ...prev, reportUrl: `${window.location.origin}/cr/${token}` }));
                        } catch { toast.error("리포트 생성 실패"); }
                      });
                    }}
                  >
                    {isCreatingReport ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                    {isCreatingReport ? "만드는 중…" : "리포트 링크 생성"}
                  </Button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x6 py-x4">
        {c.status === "SCHEDULED" && (
          <Button variant="ghost" size="sm" className="text-fg-critical" onClick={onCancel} disabled={isPending}>
            면담 취소
          </Button>
        )}
        <div className="ml-auto flex items-center gap-x2">
          {c.status === "SCHEDULED" && (
            <Button variant="outline" onClick={onComplete} disabled={isPending}>
              완료 처리
            </Button>
          )}
          <Button onClick={onNavigate}>{c.status === "SCHEDULED" ? "면담 진행" : "상세 보기"}</Button>
        </div>
      </div>
    </>
  );
}

// ─── Main List ────────────────────────────────────────────────────────────────

function loadConsultFilters(key: string) {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "{}"); } catch { return {}; }
}

type CategoryFilter = "ALL" | "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING";
type TypeFilter = "ALL" | "STUDENT" | "PARENT";

export function ConsultationsList({ consultations, owner = "DIRECTOR", initialDateFrom, initialDateTo }: { consultations: Consultation[]; owner?: string; initialDateFrom: string; initialDateTo: string }) {
  const router = useRouter();
  // owner별 독립 필터 저장 (DIRECTOR/HEAD_TEACHER 카테고리 탭 구성이 달라 키 분리 필수)
  const filterKey = `consultations-list-filters:${owner}`;
  const saved = typeof window !== "undefined" ? loadConsultFilters(filterKey) : {};
  const [query, setQuery] = useState<string>(saved.q ?? "");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">(saved.status ?? "ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(saved.category ?? "ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(saved.type ?? "ALL");
  const [isPending, startTransition] = useTransition();

  // 미리 보기 시트 + 면담별 AI 메시지 상태
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiStates, setAiStates] = useState<Record<string, AiState>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(filterKey, JSON.stringify({ q: query, status: statusFilter, category: categoryFilter, type: typeFilter })); } catch {}
  }, [filterKey, query, statusFilter, categoryFilter, typeFilter]);

  const q = query.trim().toLowerCase();

  // 개별 매처 (재사용을 위해 분리)
  function matchQuery(c: Consultation) {
    if (!q) return true;
    const name = c.student?.name ?? c.prospectName ?? "";
    const grade = c.student?.grade ?? c.prospectGrade ?? "";
    return name.toLowerCase().includes(q) || grade.toLowerCase().includes(q);
  }
  const matchStatus = (c: Consultation) => statusFilter === "ALL" || c.status === statusFilter;
  const matchCategory = (c: Consultation) => categoryFilter === "ALL" || c.category === categoryFilter;
  const matchType = (c: Consultation) => typeFilter === "ALL" || c.type === typeFilter;

  const filtered = consultations.filter((c) => matchQuery(c) && matchStatus(c) && matchCategory(c) && matchType(c));

  // 탭 카운트: 해당 탭의 자체 필터를 제외하고 나머지 활성 필터를 반영
  const countByStatus = (status: Status) => consultations.filter((c) =>
    c.status === status && matchQuery(c) && matchCategory(c) && matchType(c)
  ).length;
  const countByCategory = (category: CategoryFilter) => consultations.filter((c) =>
    (category === "ALL" || c.category === category) && matchQuery(c) && matchStatus(c) && matchType(c)
  ).length;
  const countByType = (type: TypeFilter) => consultations.filter((c) =>
    (type === "ALL" || c.type === type) && matchQuery(c) && matchStatus(c) && matchCategory(c)
  ).length;

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
  const categoryTabs: { key: CategoryFilter; label: string }[] = owner === "HEAD_TEACHER"
    ? [
        { key: "ALL", label: "전체" },
        { key: "ENROLLED", label: "재원생" },
        { key: "NEW_ADMISSION", label: "신규 학생" },
      ]
    : [
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

  const hasFilter = !!q || statusFilter !== "ALL" || categoryFilter !== "ALL" || typeFilter !== "ALL";
  const preview = previewId ? consultations.find((c) => c.id === previewId) ?? null : null;
  const cancelTarget = confirmCancelId ? consultations.find((c) => c.id === confirmCancelId) ?? null : null;

  function openPreview(id: string) {
    setPreviewId(id);
    setSheetOpen(true);
  }
  const goDetail = (id: string) => router.push(`/consultations/${id}`);

  return (
    <div className="flex flex-col gap-x4">
      {/* 등록 고민 추적 배너 (원장 면담 전용) */}
      {owner === "DIRECTOR" && consideringCount > 0 && categoryFilter !== "CONSIDERING" && (
        <button
          type="button"
          onClick={() => { setCategoryFilter("CONSIDERING"); setStatusFilter("ALL"); }}
          className="flex w-full items-center justify-between gap-x3 rounded-r3 bg-bg-warning-weak px-x4 py-x3 text-left transition-colors hover:bg-bg-warning-weak-pressed"
        >
          <span className="flex items-center gap-x2 t4-medium text-fg-warning-contrast">
            <AlertCircle className="size-4 shrink-0 text-fg-warning" aria-hidden />
            등록 고민 중인 상담 {consideringCount}건 — 전환 유도가 필요합니다
          </span>
          <span className="flex shrink-0 items-center t3-medium text-fg-warning-contrast">
            보기
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </button>
      )}

      <div className="flex flex-col gap-x3">
        {/* 조회 기간 (서버측 범위) */}
        <DateRangeToolbar
          initialFrom={initialDateFrom}
          initialTo={initialDateTo}
          basePath="/consultations"
          extraParams={{ owner }}
          className="flex-wrap"
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x2">
          <div className="flex flex-wrap items-center gap-x1_5" role="group" aria-label="상태">
            {statusTabs.map((t) => (
              <FilterChip
                key={t.key}
                selected={statusFilter === t.key}
                count={t.key !== "ALL" ? countByStatus(t.key as Status) : undefined}
                onClick={() => setStatusFilter(t.key)}
              >
                {t.label}
              </FilterChip>
            ))}
          </div>

          <div className="flex w-full flex-wrap items-center gap-x2 lg:ml-auto lg:w-auto">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="w-36" aria-label="상담 분류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryTabs.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.key === "ALL" ? "분류 전체" : `${t.label} ${countByCategory(t.key)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type (책임T는 학생 상담만이므로 숨김) */}
            {owner !== "HEAD_TEACHER" && (
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger className="w-32" aria-label="상담 유형">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeTabs.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.key === "ALL" ? "유형 전체" : `${t.label} ${countByType(t.key)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative min-w-0 flex-1 sm:flex-none">
              <SearchField
                placeholder="원생 이름·학년 검색"
                aria-label="원생 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="sm:w-60"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <TableCard
        footer={
          filtered.length > 0 ? (
            <span className="t3-regular tabular-nums text-fg-neutral-subtle">
              {hasFilter ? `${consultations.length}건 중 ` : ""}
              <span className="t3-bold text-fg-neutral">{filtered.length}</span>건
            </span>
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilter ? "조건에 맞는 면담이 없어요" : "면담 기록이 없어요"}
            description={hasFilter ? "검색어나 필터를 바꿔 보세요" : "조회 기간을 바꾸거나 새 면담을 등록해 보세요"}
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => { setQuery(""); setStatusFilter("ALL"); setCategoryFilter("ALL"); setTypeFilter("ALL"); }}
                >
                  필터 초기화
                </Button>
              ) : (
                <Button asChild>
                  <Link href={`/consultations/new?owner=${owner}`}>
                    <Plus aria-hidden />
                    면담 등록
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>원생</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>예정 일시</TableHead>
                <TableHead>면담 주제</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">작업</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const status = STATUS_META[c.status];
                const category = c.category ? CATEGORY_META[c.category] : null;
                const cancelled = c.status === "CANCELLED";
                const agenda = firstLine(c.agenda);
                return (
                  <TableRow
                    key={c.id}
                    tabIndex={0}
                    className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
                    onClick={() => goDetail(c.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") goDetail(c.id); }}
                  >
                    <TableCell className="whitespace-nowrap">
                      <span className={cn("t4-medium", cancelled ? "text-fg-neutral-subtle" : "text-fg-neutral")}>
                        {displayName(c)}
                      </span>
                      {(c.student?.grade || c.prospectGrade) && (
                        <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">
                          {c.student?.grade ?? c.prospectGrade}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-x1_5">
                        {category && <StatusBadge tone={category.tone}>{category.label}</StatusBadge>}
                        {c.type && (
                          <span className="t3-regular text-fg-neutral-muted">{TYPE_LABEL[c.type] ?? c.type}</span>
                        )}
                        {!category && !c.type && <span className="text-fg-placeholder">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {c.scheduledAt ? (
                        <span className={cancelled ? "text-fg-neutral-subtle" : "text-fg-neutral"}>{formatKST(c.scheduledAt)}</span>
                      ) : (
                        <span className="text-fg-placeholder">미정</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {agenda ? (
                        <span className="block max-w-72 truncate text-fg-neutral-muted">{agenda}</span>
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-x1">
                        {c.status === "SCHEDULED" && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => quickStatus(c.id, "COMPLETED")}
                            disabled={isPending}
                          >
                            <CheckCircle aria-hidden />
                            완료
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => openPreview(c.id)}
                          aria-label="미리 보기"
                          title="미리 보기"
                          className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                        >
                          <Eye className="size-4" aria-hidden />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="더보기"
                              className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => goDetail(c.id)}>
                              {c.status === "SCHEDULED" ? "면담 진행" : "상세 보기"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openPreview(c.id)}>
                              <Sparkles aria-hidden />
                              내용 · AI 메시지
                            </DropdownMenuItem>
                            {c.status === "SCHEDULED" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-fg-critical"
                                  onSelect={() => setConfirmCancelId(c.id)}
                                  disabled={isPending}
                                >
                                  <XCircle aria-hidden />
                                  면담 취소
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {/* 미리 보기 시트 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {preview && (
            <ConsultationPreview
              key={preview.id}
              c={preview}
              ai={aiStates[preview.id] ?? AI_INITIAL}
              setAi={(update) => setAiStates((prev) => ({ ...prev, [preview.id]: update(prev[preview.id] ?? AI_INITIAL) }))}
              isPending={isPending}
              onNavigate={() => goDetail(preview.id)}
              onComplete={() => { quickStatus(preview.id, "COMPLETED"); setSheetOpen(false); }}
              onCancel={() => setConfirmCancelId(preview.id)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmCancelId !== null}
        onOpenChange={(o) => { if (!o) setConfirmCancelId(null); }}
        title="면담을 취소할까요?"
        description={cancelTarget ? `${displayName(cancelTarget)} 면담이 취소 상태로 바뀌어요.` : undefined}
        confirmLabel="면담 취소"
        pending={isPending}
        onConfirm={() => {
          if (confirmCancelId) quickStatus(confirmCancelId, "CANCELLED");
          setConfirmCancelId(null);
          setSheetOpen(false);
        }}
      />
    </div>
  );
}
