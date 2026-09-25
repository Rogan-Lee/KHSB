"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  X,
  Link2,
  Send,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  UserMinus,
  CalendarClock,
  Settings2,
  MousePointerClick,
} from "lucide-react";
import {
  createParentReportsForStudents,
  updateParentReportNote,
  type StudentReportRow,
  type BulkCreateByStudentResult,
} from "@/actions/parent-reports";
import { enqueueMentoringAiComments } from "@/actions/report-ai-queue";
import { enhanceMentoringWithAI, type EnhancedMentoringContent } from "@/actions/ai-enhance";
import { getShareWording, setAppSetting } from "@/actions/app-settings";
import { SHARE_WORDING_KEYS, renderShareWording } from "@/lib/share-wording";
import { EmptyState, FilterChip, FormActions, SearchField, Section, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "./confirm-dialog";

interface Props {
  rows: StudentReportRow[];
}

export function MentoringReportTab({ rows }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(rows[0]?.studentId ?? null);
  const [query, setQuery] = useState("");
  const [showOnlyWithReport, setShowOnlyWithReport] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [enqueueConfirmOpen, setEnqueueConfirmOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, "pending" | "created" | "existing" | "no-mentoring" | "failed">>({});

  // 디테일: 편집 중 customNote
  const activeRow = useMemo(() => rows.find((r) => r.studentId === activeStudentId) ?? null, [rows, activeStudentId]);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  // 공유 문구 커스텀 (AppSetting)
  const [wordingOpen, setWordingOpen] = useState(false);
  const [wordingDraft, setWordingDraft] = useState<string | null>(null);
  const [wordingSaving, setWordingSaving] = useState(false);

  async function openWordingEditor() {
    setWordingOpen(true);
    if (wordingDraft === null) {
      try { setWordingDraft(await getShareWording(SHARE_WORDING_KEYS.PARENT_REPORT)); }
      catch { setWordingDraft(""); }
    }
  }
  async function saveWording() {
    if (wordingDraft === null) return;
    setWordingSaving(true);
    try {
      await setAppSetting(SHARE_WORDING_KEYS.PARENT_REPORT, wordingDraft);
      toast.success("공유 문구를 저장했어요");
      setWordingOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패 (원장만 가능)");
    } finally {
      setWordingSaving(false);
    }
  }
  const [copied, setCopied] = useState(false);

  // 활성 학생 바뀌면 편집 draft 리셋
  useMemo(() => {
    setNoteDraft(activeRow?.parentReport?.customNote ?? "");
  }, [activeRow?.parentReport?.id, activeRow?.parentReport?.customNote]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (showOnlyWithReport && !r.parentReport) return false;
      if (q && !r.studentName.toLowerCase().includes(q) && !(r.grade ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, showOnlyWithReport]);

  const createdCount = rows.filter((r) => !!r.parentReport).length;

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

  async function handleBulkCreate() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    const targets = Array.from(selectedIds);
    const initial: Record<string, "pending"> = {};
    for (const id of targets) initial[id] = "pending";
    setBulkProgress(initial);
    setBulkBusy(true);
    try {
      const results: BulkCreateByStudentResult[] = await createParentReportsForStudents(targets);
      const next: Record<string, "created" | "existing" | "no-mentoring" | "failed"> = {};
      let created = 0, existing = 0, nomenturing = 0, failed = 0;
      for (const r of results) {
        next[r.studentId] = r.status;
        if (r.status === "created") created++;
        else if (r.status === "existing") existing++;
        else if (r.status === "no-mentoring") nomenturing++;
        else failed++;
      }
      setBulkProgress(next);
      toast.success(
        `생성 ${created}건 · 기존 ${existing}건` +
        (nomenturing > 0 ? ` · 멘토링 없음 ${nomenturing}` : "") +
        (failed > 0 ? ` · 실패 ${failed}` : "")
      );
      setShowOnlyWithReport(true);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 실패");
    } finally {
      setBulkBusy(false);
    }
  }

  // AI 코멘트 예약 큐 등록 (야간 Claude 루틴이 생성)
  async function handleEnqueueAiComments() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    setEnqueueConfirmOpen(true);
  }

  async function confirmEnqueueAiComments() {
    setEnqueuing(true);
    try {
      const r = await enqueueMentoringAiComments({ studentIds: Array.from(selectedIds) });
      toast.success(
        `예약 ${r.queued}건 · 건너뜀 ${r.skipped}건` + (r.failed > 0 ? ` · 실패 ${r.failed}건` : ""),
      );
      setEnqueueConfirmOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "예약 등록 실패");
    } finally {
      setEnqueuing(false);
    }
  }

  async function handleSaveNote() {
    if (!activeRow?.parentReport) return;
    setNoteSaving(true);
    try {
      await updateParentReportNote(activeRow.parentReport.id, noteDraft);
      toast.success("내용 저장");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleAiEnhance() {
    if (!activeRow?.latestMentoring) return;
    setAiBusy(true);
    try {
      const data: EnhancedMentoringContent = await enhanceMentoringWithAI(activeRow.latestMentoring.id);
      const text = [
        data.content && `[오늘 멘토링 내용]\n${data.content}`,
        data.improvements && `[개선된 점]\n${data.improvements}`,
        data.weaknesses && `[보완할 점]\n${data.weaknesses}`,
        data.nextGoals && `[다음 멘토링 목표]\n${data.nextGoals}`,
        data.notes && `[기타 메모]\n${data.notes}`,
      ].filter(Boolean).join("\n\n");
      setNoteDraft(text);
      toast.success("AI 초안 생성 — 검토 후 저장");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 실패");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!activeRow?.parentReport || typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${activeRow.parentReport.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("링크가 복사되었습니다");
  }

  async function handleShareKakao() {
    if (!activeRow?.parentReport || typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${activeRow.parentReport.token}`;
    const dateLabel = activeRow.latestMentoring ? formatDate(activeRow.latestMentoring.date) : "오늘";
    const shareText = `안녕하세요, ${activeRow.studentName} 학부모님.\n${dateLabel} 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${activeRow.studentName} 멘토링 리포트`, text: shareText }); } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("메시지가 복사되었습니다");
    }
  }

  async function handleBulkShareCopy() {
    const targets = Array.from(selectedIds)
      .map((sid) => rows.find((r) => r.studentId === sid))
      .filter((r): r is StudentReportRow => !!r?.parentReport);
    if (targets.length === 0) {
      toast.error("발송할 리포트가 없습니다 (선택 중 리포트 생성된 건 0)");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const lines = targets.map((r) => `${r.studentName} ${r.grade} — ${origin}/r/${r.parentReport!.token}`);
    // 운영진이 커스텀한 공유 문구 템플릿 적용 ({count}, {links} 치환)
    const template = await getShareWording(SHARE_WORDING_KEYS.PARENT_REPORT);
    const text = renderShareWording(template, { count: targets.length, links: lines.join("\n") });
    await navigator.clipboard.writeText(text);
    toast.success(`${targets.length}건 링크 복사됨`);
  }

  const reportUrlFor = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/r/${token}` : `/r/${token}`;
  const allFilteredChecked = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.studentId));
  const someFilteredChecked = filtered.some((r) => selectedIds.has(r.studentId));

  return (
    <div className="flex flex-col gap-x4">
      {/* 상단 툴바 — 요약 · 공유 문구 · 일괄 작업 */}
      <div className="flex flex-wrap items-center gap-x2">
        <p className="t4-regular text-fg-neutral-muted">
          총 <span className="t4-bold tabular-nums text-fg-neutral">{rows.length}</span>명 · 리포트 생성{" "}
          <span className="t4-bold tabular-nums text-fg-brand">{createdCount}</span>건
        </p>
        <Button size="xs" variant="ghost" onClick={openWordingEditor} aria-expanded={wordingOpen}>
          <Settings2 />
          공유 문구 설정
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-x2">
          {bulkBusy && (
            <span className="t3-regular tabular-nums text-fg-neutral-subtle">
              {Object.values(bulkProgress).filter((s) => s !== "pending").length}/{Object.keys(bulkProgress).length} 진행 중
            </span>
          )}
          <Link
            href="/reports/ai-queue"
            className="inline-flex items-center gap-x1 rounded-r2 px-x1_5 py-x1 t4-medium text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
          >
            <CalendarClock className="size-4" aria-hidden />
            예약 대기열
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnqueueAiComments}
            disabled={enqueuing || selectedIds.size === 0}
          >
            {enqueuing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {enqueuing ? "등록 중…" : "AI 코멘트 예약"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkShareCopy}
            disabled={selectedIds.size === 0}
          >
            <Send />
            선택 링크 복사
          </Button>
          <Button size="sm" onClick={handleBulkCreate} disabled={bulkBusy || selectedIds.size === 0}>
            {bulkBusy ? <Loader2 className="animate-spin" /> : <Link2 />}
            {bulkBusy ? "생성 중…" : `선택 ${selectedIds.size}명 일괄 생성`}
          </Button>
        </div>
      </div>

      {/* 공유 문구 편집 */}
      {wordingOpen && (
        <Section
          title="공유 문구"
          description={
            <>
              링크를 복사할 때 붙는 문구예요. <code className="rounded-r1 bg-bg-neutral-weak px-x1 t3-medium">{"{count}"}</code> 는 링크 수,{" "}
              <code className="rounded-r1 bg-bg-neutral-weak px-x1 t3-medium">{"{links}"}</code> 는 링크 목록으로 바뀌어요.
            </>
          }
        >
          <Textarea
            value={wordingDraft ?? ""}
            onChange={(e) => setWordingDraft(e.target.value)}
            rows={5}
            placeholder="문구를 불러오는 중…"
            aria-label="공유 문구"
          />
          <FormActions className="mt-x3">
            <Button variant="outline" onClick={() => setWordingOpen(false)}>닫기</Button>
            <Button onClick={saveWording} disabled={wordingSaving || wordingDraft === null}>
              {wordingSaving ? "저장 중…" : "저장 (원장)"}
            </Button>
          </FormActions>
        </Section>
      )}

      <div className="grid min-h-[600px] grid-cols-1 gap-x4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* 좌측 학생 리스트 */}
        <section className="flex flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <div className="flex flex-col gap-x2_5 border-b border-stroke-neutral-muted p-x4">
            <div className="flex items-center gap-x3">
              <Checkbox
                checked={allFilteredChecked ? true : someFilteredChecked ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="화면에 보이는 학생 전체 선택"
                title="화면에 보이는 학생 전체 선택"
              />
              <div className="relative min-w-0 flex-1">
                <SearchField
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름·학년 검색"
                  aria-label="이름·학년 검색"
                  className="pr-x8 sm:w-full"
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
            </div>
            <div className="flex items-center justify-between gap-x2">
              <FilterChip selected={showOnlyWithReport} onClick={() => setShowOnlyWithReport(!showOnlyWithReport)}>
                생성된 리포트만
              </FilterChip>
              <span className="t3-regular tabular-nums text-fg-neutral-subtle">{filtered.length}/{rows.length}명</span>
            </div>
          </div>
          <ul className="max-h-[600px] flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li>
                <EmptyState
                  compact
                  icon={Search}
                  title={query || showOnlyWithReport ? "조건에 맞는 원생이 없어요" : "활성 원생이 없어요"}
                />
              </li>
            ) : (
              filtered.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const isChecked = selectedIds.has(r.studentId);
                const prog = bulkProgress[r.studentId];
                return (
                  <li
                    key={r.studentId}
                    className={cn(
                      "flex items-start gap-x3 border-b border-stroke-neutral-muted px-x4 py-x3 transition-colors last:border-0",
                      isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleOne(r.studentId)}
                      aria-label={`${r.studentName} 선택`}
                      className="mt-x0_5"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveStudentId(r.studentId)}
                      aria-current={isActive ? "true" : undefined}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-x1_5">
                        <span className="truncate t4-bold text-fg-neutral">{r.studentName}</span>
                        <span className="shrink-0 t3-regular text-fg-neutral-subtle">{r.grade}</span>
                        <span className="ml-auto flex shrink-0 items-center">
                          {prog === "pending" ? (
                            <Loader2 className="size-4 animate-spin text-fg-informative" aria-label="생성 중" />
                          ) : prog === "no-mentoring" ? (
                            <StatusBadge tone="gray">
                              <UserMinus />
                              멘토링 없음
                            </StatusBadge>
                          ) : prog === "failed" ? (
                            <StatusBadge tone="bad">실패</StatusBadge>
                          ) : r.parentReport ? (
                            <StatusBadge tone="ok">생성됨</StatusBadge>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-x0_5 t3-regular text-fg-neutral-subtle">
                        {r.latestMentoring ? (
                          <span className="tabular-nums">
                            최근 {formatDate(r.latestMentoring.date)} · {r.latestMentoring.mentorName}
                            {r.parentReport && (
                              <span className="text-fg-positive"> · 리포트 {formatDate(r.parentReport.createdAt)}</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-x1 text-fg-warning">
                            <AlertCircle className="size-3.5" aria-hidden />
                            완료된 멘토링 없음
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* 우측: 상세 */}
        <section className="flex min-h-[600px] flex-col rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          {!activeRow ? (
            <EmptyState
              icon={MousePointerClick}
              title="원생을 골라 주세요"
              description="왼쪽 목록에서 원생을 누르면 리포트 내용을 확인하고 보낼 수 있어요"
              className="flex-1"
            />
          ) : (
            <>
              {/* 헤더 */}
              <div className="border-b border-stroke-neutral-muted px-x5 py-x4">
                <div className="flex flex-wrap items-baseline gap-x2">
                  <h3 className="t6-bold text-fg-neutral">{activeRow.studentName}</h3>
                  <span className="t3-regular text-fg-neutral-subtle">
                    {activeRow.grade}{activeRow.school ? ` · ${activeRow.school}` : ""}
                  </span>
                  {activeRow.parentReport && <StatusBadge tone="ok">리포트 생성됨</StatusBadge>}
                </div>
                {activeRow.latestMentoring ? (
                  <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                    최근 멘토링 {formatDate(activeRow.latestMentoring.date)} · {activeRow.latestMentoring.mentorName}
                  </p>
                ) : (
                  <p className="mt-x1 t3-regular text-fg-warning">완료된 멘토링이 없어요</p>
                )}
              </div>

              {!activeRow.latestMentoring ? (
                <EmptyState
                  icon={AlertCircle}
                  title="완료된 멘토링 기록이 필요해요"
                  description={"학부모 리포트는 완료된 멘토링 기록으로 만들어요.\n먼저 \"멘토링 기록\" 탭에서 멘토링을 완료 처리해 주세요."}
                  className="flex-1"
                />
              ) : !activeRow.parentReport ? (
                <EmptyState
                  icon={Link2}
                  title="아직 리포트가 없어요"
                  description="이 원생의 최근 멘토링으로 학부모 리포트를 만들 수 있어요"
                  action={
                    <Button size="sm" onClick={() => { setSelectedIds(new Set([activeRow.studentId])); handleBulkCreate(); }}>
                      <Link2 />
                      이 학생 리포트 생성
                    </Button>
                  }
                  className="flex-1"
                />
              ) : (
                <div className="flex flex-1 flex-col gap-x6 overflow-y-auto p-x5">
                  {/* URL 들어가는 내용 편집 */}
                  <div className="flex flex-col gap-x2">
                    <div className="flex flex-wrap items-center justify-between gap-x2">
                      <div>
                        <h4 className="t5-bold text-fg-neutral">학부모에게 전할 내용</h4>
                        <p className="t3-regular text-fg-neutral-subtle">공유 페이지에 그대로 보여요</p>
                      </div>
                      <Button variant="outline" size="xs" onClick={handleAiEnhance} disabled={aiBusy}>
                        {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        {aiBusy ? "다듬는 중…" : "AI 고도화"}
                      </Button>
                    </div>
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={14}
                      placeholder="학부모에게 전달할 내용을 입력하세요. AI 고도화로 입시 컨설턴트 문체로 다듬을 수 있어요."
                      className="resize-y"
                      aria-label="학부모에게 전할 내용"
                    />
                    <FormActions>
                      {noteDraft !== (activeRow.parentReport.customNote ?? "") && (
                        <span className="mr-auto t3-medium text-fg-warning">바뀐 내용이 있어요 — 저장해 주세요</span>
                      )}
                      <Button size="sm" onClick={handleSaveNote} disabled={noteSaving || noteDraft === (activeRow.parentReport.customNote ?? "")}>
                        {noteSaving ? "저장 중…" : "저장"}
                      </Button>
                    </FormActions>
                  </div>

                  {/* URL / 발송 */}
                  <div className="flex flex-col gap-x3 border-t border-stroke-neutral-muted pt-x5">
                    <h4 className="t5-bold text-fg-neutral">링크 · 발송</h4>
                    <div className="flex items-center gap-x2">
                      <Input
                        readOnly
                        value={reportUrlFor(activeRow.parentReport.token)}
                        aria-label="리포트 링크"
                        className="t3-regular"
                      />
                      <Button variant="outline" size="icon" onClick={handleCopyLink} aria-label="링크 복사">
                        {copied ? <Check className="text-fg-positive" /> : <Copy />}
                      </Button>
                      <Button asChild variant="outline" size="icon">
                        <a
                          href={`/r/${activeRow.parentReport.token}`}
                          target="_blank"
                          rel="noreferrer"
                          title="학부모 화면 열기"
                          aria-label="학부모 화면 열기"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    </div>
                    <KakaoButton size="lg" className="w-full" onClick={handleShareKakao}>
                      카카오톡으로 보내기
                    </KakaoButton>
                    <p className="t3-regular text-fg-neutral-subtle">
                      여러 명에게 보낼 때는 위의 &quot;선택 링크 복사&quot;로 링크를 한 번에 복사할 수 있어요.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={enqueueConfirmOpen}
        onOpenChange={setEnqueueConfirmOpen}
        title="AI 코멘트 예약"
        description={`선택한 ${selectedIds.size}명의 'AI 코멘트'를 예약 큐에 등록할까요?\n리포트가 없으면 먼저 생성되고, 야간 Claude 루틴이 코멘트를 생성해요.`}
        destructive={false}
        confirmLabel="예약 등록"
        pendingLabel="등록 중…"
        pending={enqueuing}
        onConfirm={confirmEnqueueAiComments}
      />
    </div>
  );
}
