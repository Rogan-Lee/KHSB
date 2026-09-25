"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateMonthlyReportsBulk, markReportsSentBulk } from "@/actions/reports";
import type { BulkReportResult } from "@/actions/reports";
import { enqueueMonthlyAiSummaries } from "@/actions/report-ai-queue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Image as ImageIcon, AlertCircle, XCircle, Send, CalendarClock, RotateCcw, Users, FileText, X,
} from "lucide-react";
import { EmptyState, FilterChip, SearchField, StatusBadge } from "@/components/backoffice/ui";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReportDetailPane, type ReportLite } from "./report-detail-pane";

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Props {
  year: number;
  month: number;
  students: Student[];
  reports: ReportLite[];
}

function formatMinutes(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  if (h < 1) return `${Math.round(minutes)}분`;
  return `${h}시간`;
}

export function MonthlyReportPanel({ year, month, students, reports }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(students[0]?.id ?? null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, "pending" | "success" | "failed">>({});
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showOnlyGenerated, setShowOnlyGenerated] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [confirm, confirmDialog] = useConfirmDialog();

  const reportMap = useMemo(() => new Map(reports.map((r) => [r.studentId, r])), [reports]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (showOnlyGenerated && !reportMap.has(s.id)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.grade ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [students, query, showOnlyGenerated, reportMap]);

  const activeStudent = useMemo(
    () => students.find((s) => s.id === activeStudentId) ?? null,
    [students, activeStudentId]
  );
  const activeReport = activeStudentId ? reportMap.get(activeStudentId) ?? null : null;

  // 전체·생성·발송 통계는 페이지 상단(StatCards)에서 보여준다.

  function toggleAll() {
    if (selectedIds.size === filteredStudents.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(ids: string[]) {
    const initial: Record<string, "pending"> = {};
    for (const id of ids) initial[id] = "pending";
    setBulkProgress(initial);
    setBulkErrors({});
    setBulkGenerating(true);

    try {
      const results: BulkReportResult[] = await generateMonthlyReportsBulk(ids, year, month);
      const nextProg: Record<string, "success" | "failed"> = {};
      const nextErr: Record<string, string> = {};
      let ok = 0, ng = 0;
      for (const r of results) {
        nextProg[r.studentId] = r.status;
        if (r.status === "failed") { ng++; if (r.reason) nextErr[r.studentId] = r.reason; }
        else ok++;
      }
      setBulkProgress(nextProg);
      setBulkErrors(nextErr);
      toast.success(`생성 완료: ${ok}건${ng > 0 ? ` (실패 ${ng}건)` : ""}`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 실패");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleBulkGenerate() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    await runBulk(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleRetryFailed() {
    const failedIds = Object.entries(bulkProgress)
      .filter(([, s]) => s === "failed")
      .map(([id]) => id);
    if (failedIds.length === 0) return;
    await runBulk(failedIds);
  }

  // 일괄 발송: 선택한 학생 중 리포트 있고 sentAt==null 인 것들만
  async function handleBulkMarkSent() {
    const targetIds = Array.from(selectedIds)
      .map((sid) => reportMap.get(sid))
      .filter((r): r is ReportLite => !!r && !r.sentAt)
      .map((r) => r.id);
    if (targetIds.length === 0) {
      toast.error("발송 처리할 리포트가 없습니다 (선택 중 생성된 미발송 리포트 0건)");
      return;
    }
    const ok = await confirm({
      title: `리포트 ${targetIds.length}개를 발송 처리할까요?`,
      description: "선택한 학생 중 생성됐지만 아직 보내지 않은 리포트만 발송 완료로 표시돼요.",
      confirmLabel: "발송 처리",
    });
    if (!ok) return;
    try {
      const { updated } = await markReportsSentBulk(targetIds);
      toast.success(`${updated}건 발송 처리 완료`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발송 처리 실패");
    }
  }

  // AI 종합의견 예약 큐 등록 (야간 Claude 루틴이 생성)
  async function handleEnqueueAiSummaries() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    const ok = await confirm({
      title: `${selectedIds.size}명의 AI 종합의견을 예약할까요?`,
      description: `${year}년 ${month}월 'AI 종합의견'을 예약 큐에 등록해요.\n리포트가 없으면 먼저 생성되고, 야간 Claude 루틴이 종합의견을 만들어요.`,
      confirmLabel: "예약 등록",
    });
    if (!ok) return;
    setEnqueuing(true);
    try {
      const r = await enqueueMonthlyAiSummaries({
        studentIds: Array.from(selectedIds),
        year,
        month,
      });
      toast.success(
        `예약 ${r.queued}건 · 건너뜀 ${r.skipped}건` + (r.failed > 0 ? ` · 실패 ${r.failed}건` : ""),
      );
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "예약 등록 실패");
    } finally {
      setEnqueuing(false);
    }
  }

  const failedCount = Object.values(bulkProgress).filter((s) => s === "failed").length;

  const doneCount = Object.values(bulkProgress).filter((st) => st !== "pending").length;
  const allFilteredChecked = filteredStudents.length > 0 && selectedIds.size === filteredStudents.length;

  return (
    <div className="flex flex-col gap-x3">
      {/* 상단 툴바: 선택 요약 + 일괄 작업 */}
      <div className="flex flex-wrap items-center gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
        <span className="t4-regular text-fg-neutral-muted">
          {selectedIds.size > 0 ? (
            <>
              <span className="t4-bold tabular-nums text-fg-brand">{selectedIds.size}명</span> 선택됨
            </>
          ) : (
            "학생을 선택하면 한 번에 만들고 보낼 수 있어요"
          )}
        </span>
        {bulkGenerating && (
          <span className="inline-flex items-center gap-x1 t3-medium tabular-nums text-fg-informative" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {doneCount}/{Object.keys(bulkProgress).length} 진행 중
          </span>
        )}
        <div className="flex w-full flex-wrap items-center gap-x2 sm:ml-auto sm:w-auto">
          {failedCount > 0 && !bulkGenerating && (
            <Button size="sm" variant="outline" onClick={handleRetryFailed} className="text-fg-critical">
              <RotateCcw />
              실패 {failedCount}건 재시도
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnqueueAiSummaries}
            disabled={enqueuing || selectedIds.size === 0}
          >
            {enqueuing ? <Loader2 className="animate-spin" /> : <CalendarClock />}
            {enqueuing ? "등록 중…" : "AI 종합의견 예약"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkMarkSent}
            disabled={selectedIds.size === 0}
          >
            <Send />
            선택 일괄 발송
          </Button>
          <Button size="sm" onClick={handleBulkGenerate} disabled={bulkGenerating || selectedIds.size === 0}>
            {bulkGenerating ? <Loader2 className="animate-spin" /> : <FileText />}
            {bulkGenerating ? "생성 중…" : `선택 ${selectedIds.size}명 리포트 생성`}
          </Button>
        </div>
      </div>

      {/* 2-col 마스터-디테일 — viewport 기준 고정 높이 + grid row 명시(minmax(0,1fr))로 내부 스크롤 강제 */}
      <div className="grid h-[calc(100vh-260px)] min-h-[500px] grid-cols-1 gap-x3 [grid-template-rows:minmax(0,1fr)] lg:grid-cols-[340px_1fr]">
        {/* 좌측: 학생 리스트 */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <div className="flex flex-col gap-x2 border-b border-stroke-neutral-muted p-x3">
            <div className="flex items-center gap-x2_5 pl-x1">
              <Checkbox
                checked={allFilteredChecked ? true : selectedIds.size > 0 ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="화면에 보이는 학생 전체 선택"
                title="화면에 보이는 학생 전체 선택"
              />
              <div className="relative min-w-0 flex-1">
                <SearchField
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름·학년 검색"
                  aria-label="학생 검색"
                  className="h-9 pr-x8 sm:w-full"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="검색어 지우기"
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-x2">
              <FilterChip selected={showOnlyGenerated} onClick={() => setShowOnlyGenerated((v) => !v)}>
                생성된 리포트만
              </FilterChip>
              <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                {filteredStudents.length}/{students.length}명
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-stroke-neutral-muted overflow-y-auto">
            {filteredStudents.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title={query ? "검색 결과가 없어요" : showOnlyGenerated ? "생성된 리포트가 없어요" : "학생이 없어요"}
                description={query ? "이름이나 학년을 다시 확인해 주세요." : undefined}
              />
            ) : (
              filteredStudents.map((s) => {
                const report = reportMap.get(s.id);
                const isActive = activeStudentId === s.id;
                const isChecked = selectedIds.has(s.id);
                const prog = bulkProgress[s.id];
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-x2_5 pl-x4 pr-x3 transition-colors",
                      isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleOne(s.id)}
                      aria-label={`${s.name} 선택`}
                    />
                    <button
                      type="button"
                      onClick={() => setActiveStudentId(s.id)}
                      aria-current={isActive ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-x2 py-x2_5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-x1_5">
                          <span className={cn("truncate text-fg-neutral", isActive ? "t4-bold" : "t4-medium")}>
                            {s.name}
                          </span>
                          <span className="shrink-0 t2-regular text-fg-neutral-subtle">{s.grade}</span>
                        </span>
                        {report && (
                          <span className="mt-x0_5 flex flex-wrap items-center gap-x1_5 t2-regular tabular-nums text-fg-neutral-subtle">
                            <span>{formatMinutes(report.totalStudyMinutes)}</span>
                            {report.studyRankInRoom != null && <span>· {report.studyRankInRoom}위</span>}
                            {report.tardyCount > 0 && <span className="text-fg-warning">지각 {report.tardyCount}</span>}
                            {report.absentDays > 0 && <span className="text-fg-critical">결석 {report.absentDays}</span>}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-x1_5">
                        {report &&
                          (report.attachedPhotoIds.length > 0 ? (
                            <span
                              className="inline-flex items-center gap-x0_5 t2-medium tabular-nums text-fg-neutral-subtle"
                              title={`사진 ${report.attachedPhotoIds.length}장`}
                            >
                              <ImageIcon className="size-3.5" aria-hidden />
                              {report.attachedPhotoIds.length}
                            </span>
                          ) : (
                            <span title="사진 없음" className="text-fg-warning">
                              <AlertCircle className="size-3.5" aria-hidden />
                              <span className="sr-only">사진 없음</span>
                            </span>
                          ))}
                        {prog === "pending" ? (
                          <Loader2 className="size-4 animate-spin text-fg-informative" aria-label="생성 중" />
                        ) : prog === "failed" ? (
                          <span title={bulkErrors[s.id]} className="inline-flex items-center gap-x0_5 t2-medium text-fg-critical">
                            <XCircle className="size-4" aria-hidden />
                            실패
                          </span>
                        ) : report ? (
                          report.sentAt ? (
                            <StatusBadge tone="ok">발송</StatusBadge>
                          ) : (
                            <StatusBadge tone="info">생성</StatusBadge>
                          )
                        ) : (
                          <span className="t2-regular text-fg-placeholder">미생성</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 디테일 */}
        <ReportDetailPane
          student={activeStudent}
          report={activeReport}
          year={year}
          month={month}
        />
      </div>

      {confirmDialog}
    </div>
  );
}
