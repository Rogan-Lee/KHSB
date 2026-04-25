"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  Loader2, Search, X, CheckCircle2, Circle, Link2, Send,
  ExternalLink, Copy, Check, Filter, MessageCircle, Sparkles,
  AlertCircle, ChevronLeft, ChevronRight, Mail,
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

export type OnlineReportRow = {
  studentId: string;
  studentName: string;
  grade: string;
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

const STATUS_LABEL: Record<OnlineReportStatus, string> = {
  DRAFT: "초안",
  DRAFT_FAILED: "생성 실패",
  REVIEW: "편집 중",
  APPROVED: "승인 완료",
  SENT: "발송 완료",
};

const STATUS_COLORS: Record<OnlineReportStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  DRAFT_FAILED: "bg-red-100 text-red-800 border-red-200",
  REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-blue-100 text-blue-800 border-blue-200",
  SENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    rows[0]?.studentId ?? null
  );
  const [query, setQuery] = useState("");
  const [onlyWithReport, setOnlyWithReport] = useState(false);
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

  const activeKey = `${activeRow?.studentId ?? ""}/${activeRow?.report?.id ?? ""}`;
  const [lastKey, setLastKey] = useState(activeKey);
  if (activeKey !== lastKey) {
    setMarkdownDraft(activeRow?.report?.markdown ?? "");
    setLastKey(activeKey);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyWithReport && !r.report) return false;
      if (q) {
        const hay = (r.studentName + " " + r.grade).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, onlyWithReport]);

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
    if (!confirm("AI 초안을 재생성합니다. 기존 편집 내용은 덮어쓰여집니다.")) return;
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
    if (dirty && !confirm("편집 내용이 저장되지 않았습니다. 저장 후 승인하시겠어요?")) {
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
  const dirty =
    !!activeRow?.report && markdownDraft !== (activeRow.report.markdown ?? "");

  return (
    <div className="space-y-3">
      {/* 상단 툴바 */}
      <div className="flex items-center gap-2 flex-wrap bg-muted/40 rounded-md px-3 py-2">
        <Link
          href={`/online/reports?week=${shiftWeek(weekStart, -1)}`}
          className="p-1 rounded hover:bg-background"
          title="이전 주"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-xs font-semibold tabular-nums">
          {formatWeekRange(weekStart)}
        </span>
        <Link
          href={`/online/reports?week=${shiftWeek(weekStart, 1)}`}
          className="p-1 rounded hover:bg-background"
          title="다음 주"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        <span className="text-xs text-muted-foreground ml-2">
          총 <b className="text-foreground">{rows.length}</b>명 · 생성{" "}
          <b className="text-foreground">{createdCount}</b>건
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={handleBulkShareCopy}
            disabled={selectedIds.size === 0}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            선택 링크 복사
          </Button>
          <Button
            size="sm"
            onClick={handleBulkCreate}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            {bulkBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                선택 {selectedIds.size}명 일괄 생성
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측 학생 리스트 */}
        <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  filtered.length > 0 &&
                  filtered.every((r) => selectedIds.has(r.studentId))
                }
                onChange={toggleAll}
                className="rounded"
                title="화면에 보이는 학생 전체 선택"
              />
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름/학년 검색"
                  className="h-7 pl-7 text-xs"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyWithReport}
                onChange={(e) => setOnlyWithReport(e.target.checked)}
                className="rounded h-3 w-3"
              />
              <Filter className="h-3 w-3" />
              생성된 보고서만 보기
              <span className="ml-auto tabular-nums">
                {filtered.length}/{rows.length}
              </span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto divide-y max-h-[600px]">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query || onlyWithReport ? "조건에 맞는 학생 없음" : "온라인 학생이 없습니다"}
              </p>
            ) : (
              filtered.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const isChecked = selectedIds.has(r.studentId);
                const prog = bulkProgress[r.studentId];
                return (
                  <div
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "cursor-pointer px-3 py-2.5 border-l-2 transition-colors",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-muted/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleOne(r.studentId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded shrink-0"
                      />
                      <span className="font-medium text-sm truncate">
                        {r.studentName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.grade}
                      </span>
                      <div className="ml-auto shrink-0 flex items-center gap-1">
                        {prog === "pending" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        ) : r.report ? (
                          r.report.status === "DRAFT_FAILED" ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-300 text-red-700">
                              실패
                            </Badge>
                          ) : r.report.status === "SENT" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] h-4 px-1", STATUS_COLORS[r.report.status])}
                            >
                              {STATUS_LABEL[r.report.status]}
                            </Badge>
                          )
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                        {(r.report?.unreadFeedbackCount ?? 0) > 0 && (
                          <span
                            title={`학부모 의견 ${r.report?.unreadFeedbackCount}건 미확인`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-px text-[9px] font-bold"
                          >
                            💬 {r.report?.unreadFeedbackCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      {r.assignedMentorName ? (
                        <span>멘토 {r.assignedMentorName}</span>
                      ) : (
                        <span className="text-amber-600">멘토 미배정</span>
                      )}
                      {r.report?.sentAt && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600">
                            발송 {new Date(r.report.sentAt).toLocaleDateString("ko-KR")}
                          </span>
                        </>
                      )}
                      {r.report?.status === "SENT" && (
                        <>
                          <span>·</span>
                          <span className="text-ink-4 tabular-nums">
                            열람 {r.report.viewCount}회
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 상세 */}
        <div className="border rounded-lg bg-background flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{activeRow.studentName}</h3>
                    <span className="text-xs text-muted-foreground">
                      {activeRow.grade}
                    </span>
                    {activeRow.report && (
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          STATUS_COLORS[activeRow.report.status]
                        )}
                      >
                        {STATUS_LABEL[activeRow.report.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatWeekRange(weekStart)}
                    {activeRow.report?.approvedByName &&
                      ` · 승인 ${activeRow.report.approvedByName}`}
                    {activeRow.report?.sentAt &&
                      ` · 발송 ${new Date(activeRow.report.sentAt).toLocaleDateString("ko-KR")}`}
                    {activeRow.report?.status === "SENT" &&
                      ` · 열람 ${activeRow.report.viewCount}회`}
                  </p>
                </div>
              </div>

              {!activeRow.report ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    이 학생의 주간 보고서가 아직 생성되지 않았습니다.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleSingleCreate(activeRow.studentId)}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5 mr-1" />
                    )}
                    이 학생 리포트 생성
                  </Button>
                </div>
              ) : activeRow.report.status === "DRAFT_FAILED" ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">초안 생성 실패</p>
                    {activeRow.report.errorMessage && (
                      <p className="mt-1 text-[11px] text-red-700">
                        {activeRow.report.errorMessage}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={handleRegenerate} disabled={aiBusy}>
                    {aiBusy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    재생성
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* 편집 */}
                  <section>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        학부모에게 전달할 내용 (Markdown — 공유 페이지에 렌더됨)
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs ml-auto"
                        onClick={handleRegenerate}
                        disabled={aiBusy || activeRow.report.status === "SENT"}
                      >
                        {aiBusy ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        AI 재생성
                      </Button>
                    </div>
                    <Textarea
                      value={markdownDraft}
                      onChange={(e) => setMarkdownDraft(e.target.value)}
                      rows={14}
                      disabled={activeRow.report.status === "SENT"}
                      placeholder="**이번 주 학습 개요** ..."
                      className="text-sm leading-relaxed resize-y font-mono"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      {dirty && (
                        <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
                      )}
                      <Button
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={saving || !dirty}
                      >
                        {saving ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        저장
                      </Button>
                      {canApprove && (
                        <Button size="sm" onClick={handleApprove} disabled={saving}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          승인
                        </Button>
                      )}
                    </div>
                  </section>

                  {/* 미리보기 */}
                  <section className="border-t pt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      미리 보기
                    </h4>
                    <div className="rounded-md border bg-muted/20 p-4">
                      <MarkdownViewer source={markdownDraft || "*(내용 없음)*"} />
                    </div>
                  </section>

                  {/* URL · 발송 */}
                  {canSend && (
                    <section className="border-t pt-4 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        URL · 발송
                      </h4>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={`${origin}/r/online/${activeRow.report.token}`}
                          className="text-xs font-mono bg-muted"
                        />
                        <Button variant="outline" size="sm" onClick={handleCopyLink}>
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <a
                          href={`/r/online/${activeRow.report.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="outline" size="sm" title="학부모 화면 열기">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                      <Button
                        className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
                        onClick={handleShareKakao}
                      >
                        <MessageCircle className="h-4 w-4" />
                        카카오톡으로 보내기
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleEmailMailto}
                      >
                        <Mail className="h-4 w-4" />
                        이메일로 보내기
                        {activeRow.parentEmail && (
                          <span className="text-[10.5px] text-muted-foreground font-normal">
                            → {activeRow.parentEmail}
                          </span>
                        )}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        개별 발송 외에 상단 &quot;선택 링크 복사&quot;로 여러 명 링크를 한번에 복사할 수 있어요.
                        {activeRow.report.sentChannels.length > 0 && (
                          <> · 발송 이력: {activeRow.report.sentChannels.join(", ")}</>
                        )}
                      </p>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
