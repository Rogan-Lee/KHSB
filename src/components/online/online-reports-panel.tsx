"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { EmptyState, FilterChip } from "@/components/backoffice/ui";
import {
  Loader2, CheckCircle2, Send,
  ExternalLink, Copy, Check, MessageCircle, Sparkles,
  AlertCircle, ChevronLeft, ChevronRight, Mail, ArrowUpRight,
  FileText, UsersRound,
} from "lucide-react";
import {
  batchGenerateWeeklyReports,
  generateWeeklyReportDraft,
  regenerateReportDraft,
  updateReportContent,
  approveReport,
  markReportSent,
} from "@/actions/online/parent-reports";
import { formatWeekRange, shiftWeek } from "@/lib/online/week";
import type { OnlineReportStatus } from "@/generated/prisma";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import { ReportStatusBadge, SentLockBar } from "@/components/online/report-status";
import { useConfirm } from "@/components/online/use-confirm";
import {
  DetailPane,
  DetailPaneHeader,
  MasterDetail,
  PaneSection,
  PickerCount,
} from "@/components/online/student-picker";

export type OnlineReportRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  parentEmail: string | null;
  assignedMentorName: string | null;
  report: {
    id: string;
    status: OnlineReportStatus;
    token: string;
    markdown: string;
    updatedAt: string;
    approvedByName: string | null;
    approvedAt: string | null;
    sentAt: string | null;
    viewCount: number;
    sentChannels: string[];
    errorMessage: string | null;
    unreadFeedbackCount: number;
  } | null;
};

export function OnlineReportsPanel({
  rows,
  weekStart,
  origin,
}: {
  rows: OnlineReportRow[];
  weekStart: string; // "YYYY-MM-DD"
  origin: string;    // http(s)://host — 서버에서 전달
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    rows[0]?.studentId ?? null
  );
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  const [onlyWithReport, setOnlyWithReport] = useState(false);
  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<
    Record<string, "pending" | "done" | "failed">
  >({});

  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  // 편집 draft — 활성 학생 변경 시 리셋
  const [markdownDraft, setMarkdownDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // 발송된 보고서 재편집 잠금 해제 (학생 전환 시 자동 잠금)
  const [sentUnlocked, setSentUnlocked] = useState(false);

  // 활성 학생 변경(또는 첫 마운트)마다 draft 를 서버 값으로 seed.
  // null sentinel 로 초기화해 첫 렌더에도 반드시 한 번 동기화되게 한다.
  const activeKey = `${activeRow?.studentId ?? ""}/${activeRow?.report?.id ?? ""}`;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (activeKey !== lastKey) {
    setMarkdownDraft(activeRow?.report?.markdown ?? "");
    setSentUnlocked(false);
    setLastKey(activeKey);
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyWithReport && !r.report) return false;
      if (!matchesStudentFilter(r, filter)) return false;
      return true;
    });
  }, [rows, filter, onlyWithReport]);

  const createdCount = rows.filter((r) => !!r.report).length;

  function toggleAll() {
    if (filtered.length > 0 && filtered.every((r) => selectedIds.has(r.studentId))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.studentId)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // — 생성/편집/발송 액션 —

  async function handleBulkCreate() {
    const targets = Array.from(selectedIds);
    if (targets.length === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    const initial: Record<string, "pending"> = {};
    for (const id of targets) initial[id] = "pending";
    setBulkProgress(initial);
    setBulkBusy(true);
    try {
      const result = await batchGenerateWeeklyReports({
        weekStart,
        studentIds: targets,
      });
      toast.success(
        `생성 성공 ${result.success}건 · 실패 ${result.failed}건 · 총 ${result.total}명`
      );
      setOnlyWithReport(true);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "일괄 생성 실패");
    } finally {
      setBulkBusy(false);
      setBulkProgress({});
    }
  }

  async function handleSingleCreate(studentId: string) {
    setBulkBusy(true);
    try {
      const result = await generateWeeklyReportDraft({ studentId, weekStart });
      if (result.status === "DRAFT_FAILED") {
        toast.error("초안 생성 실패 — AI 오류 또는 데이터 부족");
      } else {
        toast.success("초안이 생성되었습니다");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!activeRow?.report) return;
    if (
      !(await confirm({
        title: "AI 초안을 다시 만들까요?",
        description: "지금 편집한 내용은 새 초안으로 덮어써져요.",
        confirmLabel: "다시 만들기",
        destructive: true,
      }))
    )
      return;
    setAiBusy(true);
    try {
      const result = await regenerateReportDraft(activeRow.report.id);
      if (result.status === "DRAFT_FAILED") {
        toast.error("재생성 실패 — AI 오류");
      } else {
        toast.success("재생성 완료");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "재생성 실패");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSaveNote() {
    if (!activeRow?.report) return;
    if (!markdownDraft.trim()) {
      toast.error("내용을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      await updateReportContent({
        reportId: activeRow.report.id,
        markdown: markdownDraft,
      });
      toast.success("내용 저장");
      setSentUnlocked(false); // 저장 후 SENT 잠금 자동 복귀
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!activeRow?.report) return;
    const dirty = markdownDraft !== activeRow.report.markdown;
    if (
      dirty &&
      !(await confirm({
        title: "저장하지 않은 편집 내용이 있어요",
        description: "편집 내용을 저장한 뒤 승인할까요?",
        confirmLabel: "저장 후 승인",
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      if (dirty) {
        await updateReportContent({
          reportId: activeRow.report.id,
          markdown: markdownDraft,
        });
      }
      await approveReport(activeRow.report.id);
      toast.success("승인 완료 — 이제 발송할 수 있습니다");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "승인 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink() {
    if (!activeRow?.report) return;
    const url = `${origin}/r/online/${activeRow.report.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("링크가 복사되었습니다");
    // APPROVED 상태면 발송 처리
    if (activeRow.report.status === "APPROVED") {
      try {
        await markReportSent({
          reportId: activeRow.report.id,
          channel: "MANUAL_COPY",
        });
        startTransition(() => router.refresh());
      } catch { /* ignore */ }
    }
  }

  function handleEmailMailto() {
    if (!activeRow?.report) return;
    const url = `${origin}/r/online/${activeRow.report.token}`;
    const subject = `${activeRow.studentName} 학부모 보고서 — ${formatWeekRange(weekStart)}`;
    const body =
      `안녕하세요, ${activeRow.studentName} 학부모님.\n` +
      `${formatWeekRange(weekStart)} 주간 보고서를 정리해 드립니다.\n` +
      `아래 링크를 통해 확인해 주세요.\n\n${url}`;
    const to = activeRow.parentEmail ?? "";
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    if (
      activeRow.report.status === "APPROVED" ||
      activeRow.report.status === "SENT"
    ) {
      markReportSent({
        reportId: activeRow.report.id,
        channel: "EMAIL",
      })
        .then(() => startTransition(() => router.refresh()))
        .catch(() => {});
    }
  }

  async function handleShareKakao() {
    if (!activeRow?.report) return;
    const url = `${origin}/r/online/${activeRow.report.token}`;
    const shareText =
      `안녕하세요, ${activeRow.studentName} 학부모님.\n` +
      `${formatWeekRange(weekStart)} 주간 보고서를 정리해 드립니다.\n` +
      `아래 링크를 통해 확인해 주세요 👇\n\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${activeRow.studentName} 주간 보고서`,
          text: shareText,
        });
      } catch {
        /* 사용자 취소 */
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("메시지가 복사되었습니다");
    }
    if (activeRow.report.status === "APPROVED" || activeRow.report.status === "SENT") {
      try {
        await markReportSent({
          reportId: activeRow.report.id,
          channel: "KAKAO_FRIEND",
        });
        startTransition(() => router.refresh());
      } catch { /* ignore */ }
    }
  }

  async function handleBulkShareCopy() {
    const targets = Array.from(selectedIds)
      .map((sid) => rows.find((r) => r.studentId === sid))
      .filter((r): r is OnlineReportRow => !!r?.report && r.report.status === "SENT");
    if (targets.length === 0) {
      toast.error("발송 완료된 보고서가 선택되지 않았습니다");
      return;
    }
    const lines = targets.map(
      (r) => `${r.studentName} ${r.grade} — ${origin}/r/online/${r.report!.token}`
    );
    const text = `${targets.length}건의 학부모 리포트 링크\n\n${lines.join("\n")}`;
    await navigator.clipboard.writeText(text);
    toast.success(`${targets.length}건 링크 복사됨`);
  }

  const reportStatus = activeRow?.report?.status ?? null;
  const canApprove = reportStatus === "DRAFT" || reportStatus === "REVIEW";
  const canSend = reportStatus === "APPROVED" || reportStatus === "SENT";
  const isSent = reportStatus === "SENT";
  const editingLocked = isSent && !sentUnlocked;
  const dirty =
    !!activeRow?.report && markdownDraft !== (activeRow.report.markdown ?? "");

  async function handleUnlockSent() {
    if (
      await confirm({
        title: "발송한 보고서를 수정할까요?",
        description: "저장하면 학부모 공개 페이지에 바로 반영돼요.",
        confirmLabel: "재편집",
      })
    ) {
      setSentUnlocked(true);
    }
  }

  // 일괄 생성은 기존 보고서를 새 AI 초안으로 덮어쓰므로(발송 완료 포함) 한 번 더 확인한다
  async function confirmBulkCreate() {
    if (selectedIds.size === 0) {
      handleBulkCreate();
      return;
    }
    const existing = rows.filter((r) => selectedIds.has(r.studentId) && r.report).length;
    const ok = await confirm({
      title: `${selectedIds.size}명의 주간 보고서를 생성할까요?`,
      description:
        existing > 0
          ? `이미 보고서가 있는 ${existing}명은 새 AI 초안으로 덮어쓰고 ‘초안’ 상태로 돌아가요.`
          : "AI가 학생별 초안을 만들어요. 인원이 많으면 몇 분 걸릴 수 있어요.",
      confirmLabel: existing > 0 ? "덮어쓰고 생성" : "생성",
      destructive: existing > 0,
    });
    if (ok) handleBulkCreate();
  }

  const allChecked =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.studentId));
  const someChecked = !allChecked && filtered.some((r) => selectedIds.has(r.studentId));
  const unreadFeedback = activeRow?.report?.unreadFeedbackCount ?? 0;

  return (
    <div className="flex flex-col gap-x4">
      {/* 주 이동 · 요약 · 일괄 작업 */}
      <div className="flex flex-wrap items-center gap-x3">
        <div className="inline-flex items-center gap-x0_5 rounded-full bg-bg-neutral-weak p-x0_5">
          <Link
            href={`/online/reports?week=${shiftWeek(weekStart, -1)}`}
            aria-label="이전 주"
            title="이전 주"
            className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-layer-default hover:text-fg-neutral"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="px-x2 t4-bold tabular-nums text-fg-neutral">
            {formatWeekRange(weekStart)}
          </span>
          <Link
            href={`/online/reports?week=${shiftWeek(weekStart, 1)}`}
            aria-label="다음 주"
            title="다음 주"
            className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-layer-default hover:text-fg-neutral"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <p className="t4-regular text-fg-neutral-subtle">
          총 <b className="t4-bold tabular-nums text-fg-neutral">{rows.length}</b>명 · 생성{" "}
          <b className="t4-bold tabular-nums text-fg-neutral">{createdCount}</b>건
        </p>
        <div className="flex w-full flex-wrap items-center gap-x2 sm:ml-auto sm:w-auto">
          {selectedIds.size > 0 && (
            <span className="t3-medium tabular-nums text-fg-brand">
              {selectedIds.size}명 선택됨
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkShareCopy}
            disabled={selectedIds.size === 0}
            title="선택한 학생 중 발송 완료된 보고서 링크를 한 번에 복사해요"
          >
            <Send />
            선택 링크 복사
          </Button>
          <Button
            size="sm"
            onClick={confirmBulkCreate}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            {bulkBusy ? (
              <>
                <Loader2 className="animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Sparkles />
                선택 {selectedIds.size}명 일괄 생성
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 학생 필터 (학생/학년/학교) */}
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
      />

      <MasterDetail
        list={
          // 좌측 학생 리스트 — 행마다 선택 체크박스가 있어 공용 PickerItem 대신 같은 규격으로 직접 그린다
          <aside
            aria-label="학생 목록"
            className="flex flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:sticky lg:top-20"
          >
            <div className="flex min-h-12 shrink-0 items-center gap-x3 border-b border-stroke-neutral-muted px-x4 py-x2">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={() => toggleAll()}
                aria-label="화면에 보이는 학생 전체 선택"
                title="화면에 보이는 학생 전체 선택"
              />
              <FilterChip
                selected={onlyWithReport}
                onClick={() => setOnlyWithReport(!onlyWithReport)}
              >
                생성된 보고서만
              </FilterChip>
              <span className="ml-auto t3-regular text-fg-neutral-subtle">
                <PickerCount shown={filtered.length} total={rows.length} />
              </span>
            </div>
            <div className="max-h-80 divide-y divide-stroke-neutral-muted overflow-y-auto overscroll-contain lg:max-h-[calc(100dvh-10rem)]">
              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon={UsersRound}
                  title="조건에 맞는 학생이 없어요"
                  description="필터를 바꾸거나 검색어를 지워 보세요."
                />
              ) : (
                filtered.map((r) => {
                  const isActive = activeStudentId === r.studentId;
                  const isChecked = selectedIds.has(r.studentId);
                  const prog = bulkProgress[r.studentId];
                  const unread = r.report?.unreadFeedbackCount ?? 0;
                  return (
                    <div
                      key={r.studentId}
                      className={cn(
                        "flex items-center gap-x3 px-x4 transition-colors",
                        isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleOne(r.studentId)}
                        aria-label={`${r.studentName} 선택`}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveStudentId(r.studentId)}
                        aria-current={isActive ? "true" : undefined}
                        className="flex min-w-0 flex-1 flex-col py-x3 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-x1_5">
                          <span
                            className={cn(
                              "truncate text-fg-neutral",
                              isActive ? "t4-bold" : "t4-medium"
                            )}
                          >
                            {r.studentName}
                          </span>
                          <span className="shrink-0 t3-regular text-fg-neutral-subtle">
                            {r.grade}
                          </span>
                        </span>
                        <span className="mt-x1 truncate t3-regular text-fg-neutral-subtle">
                          {r.assignedMentorName ? (
                            `멘토 ${r.assignedMentorName}`
                          ) : (
                            <span className="text-fg-warning">멘토 미배정</span>
                          )}
                          {r.report?.sentAt &&
                            ` · 발송 ${new Date(r.report.sentAt).toLocaleDateString("ko-KR")}`}
                          {r.report?.status === "SENT" && ` · 열람 ${r.report.viewCount}회`}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-x1_5">
                        {unread > 0 && r.report && (
                          <Link
                            href={`/online/reports/${r.report.id}`}
                            title={`학부모 의견 ${unread}건 미확인 — 상세 페이지로 이동`}
                            aria-label={`학부모 의견 ${unread}건 미확인`}
                            className="inline-flex h-x5 items-center gap-x0_5 rounded-full bg-bg-warning-weak px-x1_5 t1-bold tabular-nums text-fg-warning transition-colors hover:bg-bg-warning-weak-pressed"
                          >
                            <MessageCircle className="size-3" aria-hidden />
                            {unread}
                          </Link>
                        )}
                        {prog === "pending" ? (
                          <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="생성 중" />
                        ) : r.report ? (
                          <ReportStatusBadge status={r.report.status} />
                        ) : (
                          <span className="t2-regular text-fg-placeholder">미생성</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        }
        detail={
          // 우측: 상세 — 온라인 관리 공용 DetailPane · PaneSection (카드 하나 안에서 구분선으로 나눈다)
          <DetailPane className="lg:min-h-[600px]">
            {!activeRow ? (
              <EmptyState
                icon={FileText}
                title="학생을 선택해 주세요"
                description="왼쪽 목록에서 학생을 고르면 이번 주 보고서를 편집할 수 있어요."
                className="flex-1"
              />
            ) : (
              <>
                <DetailPaneHeader
                  title={activeRow.studentName}
                  meta={
                    <>
                      <span className="t4-regular text-fg-neutral-subtle">{activeRow.grade}</span>
                      {activeRow.report && <ReportStatusBadge status={activeRow.report.status} />}
                    </>
                  }
                  description={
                    <span className="tabular-nums">
                      {formatWeekRange(weekStart)}
                      {activeRow.report?.approvedByName &&
                        ` · 승인 ${activeRow.report.approvedByName}`}
                      {activeRow.report?.sentAt &&
                        ` · 발송 ${new Date(activeRow.report.sentAt).toLocaleDateString("ko-KR")}`}
                      {activeRow.report?.status === "SENT" &&
                        ` · 열람 ${activeRow.report.viewCount}회`}
                    </span>
                  }
                  actions={
                    activeRow.report ? (
                      <Button asChild size="sm" variant={unreadFeedback > 0 ? "default" : "outline"}>
                        <Link
                          href={`/online/reports/${activeRow.report.id}`}
                          title="보고서 상세 페이지에서 학부모 피드백을 확인합니다"
                        >
                          <MessageCircle />
                          {unreadFeedback > 0 ? (
                            <>
                              새 피드백 확인
                              <span className="tabular-nums">{unreadFeedback}</span>
                            </>
                          ) : (
                            <>상세 · 피드백 보기</>
                          )}
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />

                {!activeRow.report ? (
                  <EmptyState
                    icon={FileText}
                    title="아직 이번 주 보고서가 없어요"
                    description="AI가 이번 주 학습 기록으로 초안을 만들어요."
                    className="flex-1"
                    action={
                      <Button
                        onClick={() => handleSingleCreate(activeRow.studentId)}
                        disabled={bulkBusy}
                      >
                        {bulkBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        {bulkBusy ? "생성 중…" : "이 학생 보고서 생성"}
                      </Button>
                    }
                  />
                ) : activeRow.report.status === "DRAFT_FAILED" ? (
                  <EmptyState
                    icon={AlertCircle}
                    title="초안을 만들지 못했어요"
                    description={
                      activeRow.report.errorMessage ?? "AI 오류 또는 데이터 부족일 수 있어요."
                    }
                    className="flex-1"
                    action={
                      <Button onClick={handleRegenerate} disabled={aiBusy}>
                        {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        {aiBusy ? "생성 중…" : "다시 만들기"}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    {/* 편집 */}
                    <PaneSection
                      title="학부모에게 전달할 내용"
                      description="마크다운으로 쓰면 학부모 공유 페이지에 그대로 보여요."
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRegenerate}
                          disabled={aiBusy || editingLocked}
                        >
                          {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                          AI 재생성
                        </Button>
                      }
                    >
                      {isSent && (
                        <SentLockBar
                          className="mb-x3"
                          unlocked={sentUnlocked}
                          onUnlock={handleUnlockSent}
                          onCancel={() => {
                            setSentUnlocked(false);
                            setMarkdownDraft(activeRow.report?.markdown ?? "");
                          }}
                        />
                      )}
                      <Textarea
                        value={markdownDraft}
                        onChange={(e) => setMarkdownDraft(e.target.value)}
                        rows={14}
                        disabled={editingLocked}
                        placeholder="**이번 주 학습 개요** ..."
                        aria-label="보고서 내용 (마크다운)"
                        className="resize-y"
                      />
                      <div className="mt-x3 flex flex-wrap items-center justify-end gap-x2">
                        {dirty && (
                          <span className="mr-auto t3-medium text-fg-warning">
                            저장하지 않은 변경 사항이 있어요
                          </span>
                        )}
                        <Button
                          variant={canApprove ? "secondary" : "default"}
                          onClick={handleSaveNote}
                          disabled={saving || !dirty || editingLocked}
                        >
                          {saving ? <Loader2 className="animate-spin" /> : <Check />}
                          {saving ? "저장 중…" : "저장"}
                        </Button>
                        {canApprove && (
                          <Button onClick={handleApprove} disabled={saving}>
                            <CheckCircle2 />
                            승인
                          </Button>
                        )}
                      </div>
                    </PaneSection>

                    {/* 미리보기 */}
                    <PaneSection title="미리 보기">
                      <div className="rounded-r3 bg-bg-layer-fill p-x5">
                        <MarkdownViewer source={markdownDraft || "*(내용 없음)*"} />
                      </div>
                    </PaneSection>

                    {/* URL · 발송 */}
                    {canSend && (
                      <PaneSection
                        title="발송"
                        description="링크를 복사하거나 공유하면 발송 완료로 기록돼요."
                      >
                        <div className="flex flex-col gap-x3">
                          <div className="flex items-center gap-x2">
                            <Input
                              readOnly
                              value={`${origin}/r/online/${activeRow.report.token}`}
                              aria-label="학부모 공개 링크"
                              className="min-w-0 flex-1 t3-regular"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={handleCopyLink}
                              aria-label="링크 복사"
                              title="링크 복사"
                            >
                              {copied ? <Check className="text-fg-positive" /> : <Copy />}
                            </Button>
                            <Button asChild variant="outline" size="icon">
                              <a
                                href={`/r/online/${activeRow.report.token}`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="학부모 화면 열기"
                                title="학부모 화면 열기"
                              >
                                <ExternalLink />
                              </a>
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-x2 sm:grid-cols-2">
                            <KakaoButton onClick={handleShareKakao} className="w-full">
                              카카오톡으로 보내기
                            </KakaoButton>
                            <Button variant="outline" onClick={handleEmailMailto} className="w-full">
                              <Mail />
                              이메일로 보내기
                            </Button>
                          </div>
                          <p className="t3-regular text-fg-neutral-subtle">
                            {activeRow.parentEmail && <>이메일 받는 사람: {activeRow.parentEmail} · </>}
                            여러 명에게 한 번에 보내려면 목록에서 학생을 선택하고 ‘선택 링크 복사’를 눌러 주세요.
                            {activeRow.report.sentChannels.length > 0 && (
                              <> · 발송 이력: {activeRow.report.sentChannels.join(", ")}</>
                            )}
                          </p>
                        </div>
                      </PaneSection>
                    )}
                  </>
                )}
              </>
            )}
          </DetailPane>
        }
      />
      {confirmDialog}
    </div>
  );
}
