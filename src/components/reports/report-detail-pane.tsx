"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  generateMonthlyReport,
  ensureReportShareToken,
  updateReportMentoringSummary,
  updateReportComment,
  markReportSent,
  extractMonthlyMentoringDigest,
  getReportSupplementaryData,
  type ReportSupplementaryData,
} from "@/actions/reports";
import { toggleMeritDemeritVisibility } from "@/actions/merit-demerit";
import { toggleMonthlyNoteVisibility } from "@/actions/monthly-notes";
import { generateMonthlyMentoringSummary } from "@/actions/ai-enhance";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Loader2, Link as LinkIcon, Sparkles, Send, Check, Eye, EyeOff,
  Image as ImageIcon, RefreshCw, Clock, ClipboardList,
  TrendingUp, TrendingDown, Minus, AlertCircle, MousePointerClick,
} from "lucide-react";
import { Avatar, EmptyState, Notice, Skeleton, StatusBadge } from "@/components/backoffice/ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhotoPickerDialog } from "./photo-picker-dialog";

const EXAM_TYPE_LABEL: Record<string, string> = {
  OFFICIAL_MOCK: "공식 모의",
  PRIVATE_MOCK: "사설 모의",
  SCHOOL_EXAM: "내신",
};

export type ReportLite = {
  id: string;
  studentId: string;
  year: number;
  month: number;
  student: { id: string; name: string; grade: string };
  attendanceDays: number;
  absentDays: number;
  tardyCount: number;
  earlyLeaveCount: number;
  totalMerits: number;
  totalDemerits: number;
  mentoringCount: number;
  totalStudyMinutes: number;
  prevMonthStudyMinutes: number | null;
  studyRankInRoom: number | null;
  studyRankTotal: number | null;
  gradeAvgMinutes: number | null;
  outingCount: number;
  patrolNoteCount: number;
  patrolAbsentCount: number;
  patrolNotes?: { date: string; note: string }[];
  mentoringSummary: string | null;
  overallComment: string | null;
  shareToken: string | null;
  attachedPhotoIds: string[];
  sentAt: Date | null;
};

type StudentLite = { id: string; name: string; grade: string };

function formatMinutes(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  if (h < 1) return `${Math.round(minutes)}분`;
  return `${h}시간`;
}

export function ReportDetailPane({
  student,
  report,
  year,
  month,
}: {
  student: StudentLite | null;
  report: ReportLite | null;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState(report?.mentoringSummary ?? "");
  const [comment, setComment] = useState(report?.overallComment ?? "");
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [supp, setSupp] = useState<ReportSupplementaryData | null>(null);
  const [suppLoading, setSuppLoading] = useState(false);

  // 선택된 학생 바뀔 때 로컬 편집 상태 초기화
  useEffect(() => {
    setSummary(report?.mentoringSummary ?? "");
    setComment(report?.overallComment ?? "");
  }, [report?.id, report?.mentoringSummary, report?.overallComment]);

  // 보충 데이터(모의고사·영단어·특이사항/상벌점) 로드 — 학생/리포트 바뀔 때
  useEffect(() => {
    if (!student || !report) { setSupp(null); return; }
    let cancelled = false;
    setSuppLoading(true);
    getReportSupplementaryData(student.id, year, month)
      .then((d) => { if (!cancelled) setSupp(d); })
      .catch(() => { if (!cancelled) setSupp(null); })
      .finally(() => { if (!cancelled) setSuppLoading(false); });
    return () => { cancelled = true; };
  }, [student, report, report?.id, year, month]);

  async function toggleMeritVisible(id: string, visible: boolean) {
    setSupp((prev) => prev && {
      ...prev,
      notes: { ...prev.notes, merits: prev.notes.merits.map((m) => m.id === id ? { ...m, visibleInReport: visible } : m) },
    });
    try {
      await toggleMeritDemeritVisibility(id, visible);
    } catch {
      toast.error("저장 실패");
      setSupp((prev) => prev && {
        ...prev,
        notes: { ...prev.notes, merits: prev.notes.merits.map((m) => m.id === id ? { ...m, visibleInReport: !visible } : m) },
      });
    }
  }

  async function toggleNoteVisible(id: string, visible: boolean) {
    setSupp((prev) => prev && prev.notes.monthlyNote
      ? { ...prev, notes: { ...prev.notes, monthlyNote: { ...prev.notes.monthlyNote, visibleInReport: visible } } }
      : prev);
    try {
      await toggleMonthlyNoteVisibility(id, visible);
    } catch {
      toast.error("저장 실패");
      setSupp((prev) => prev && prev.notes.monthlyNote
        ? { ...prev, notes: { ...prev.notes, monthlyNote: { ...prev.notes.monthlyNote, visibleInReport: !visible } } }
        : prev);
    }
  }

  if (!student) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
        <EmptyState
          icon={MousePointerClick}
          title="학생을 선택하세요"
          description="왼쪽 목록에서 학생을 고르면 리포트를 보고 고칠 수 있어요."
        />
      </div>
    );
  }

  async function handleGenerate() {
    if (!student) return;
    setBusy("generate");
    try {
      await generateMonthlyReport(student.id, year, month);
      toast.success("리포트 생성/재집계 완료");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleShareLink() {
    if (!report) return;
    try {
      const token = await ensureReportShareToken(report.id);
      const url = `${window.location.origin}/r/monthly/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("공유 링크가 클립보드에 복사되었습니다");
    } catch {
      toast.error("링크 생성 실패");
    }
  }

  async function handleMarkSent() {
    if (!report) return;
    setBusy("send");
    try {
      await markReportSent(report.id);
      toast.success("발송 처리 완료");
      startTransition(() => router.refresh());
    } catch {
      toast.error("처리 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoExtract() {
    if (!student) return;
    setBusy("extract");
    try {
      const digest = await extractMonthlyMentoringDigest(student.id, year, month);
      setSummary(digest);
      toast.success("멘토링 기록 자동 추출 — 검토 후 저장");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "추출 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleAiSummary() {
    if (!student) return;
    setBusy("ai");
    try {
      const generated = await generateMonthlyMentoringSummary(student.id, year, month);
      setSummary(generated);
      toast.success("AI 초안 생성 — 검토 후 저장");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSummary() {
    if (!report) return;
    setBusy("summary");
    try {
      await updateReportMentoringSummary(report.id, summary);
      toast.success("멘토링 의견 저장");
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveComment() {
    if (!report) return;
    setBusy("comment");
    try {
      await updateReportComment(report.id, comment);
      toast.success("원장 코멘트 저장");
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setBusy(null);
    }
  }

  // 통계 카드 헬퍼
  const studyDiff = report?.prevMonthStudyMinutes != null
    ? report.totalStudyMinutes - report.prevMonthStudyMinutes
    : null;

  const lastExamIdx = supp ? supp.exams.findIndex((e) => !e.isThisMonth) : -1;
  const summaryDirty = !!report && summary !== (report.mentoringSummary ?? "");
  const commentDirty = !!report && comment !== (report.overallComment ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-x3 border-b border-stroke-neutral-muted px-x5 py-x4">
        <Avatar name={student.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x1_5">
            <h3 className="truncate t6-bold text-fg-neutral">{student.name}</h3>
            <span className="t3-regular text-fg-neutral-subtle">{student.grade}</span>
            {report ? (
              report.sentAt ? (
                <StatusBadge tone="ok">발송 완료</StatusBadge>
              ) : (
                <StatusBadge tone="info">생성됨</StatusBadge>
              )
            ) : (
              <StatusBadge tone="gray">미생성</StatusBadge>
            )}
          </div>
          <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">{year}년 {month}월 리포트</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x1_5">
          {!report ? (
            <Button size="sm" onClick={handleGenerate} disabled={busy === "generate"}>
              {busy === "generate" ? <Loader2 className="animate-spin" /> : <ClipboardList />}
              {busy === "generate" ? "생성 중…" : "리포트 생성"}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-x9"
                onClick={handleGenerate}
                disabled={busy === "generate"}
                title="통계 재집계"
                aria-label="통계 재집계"
              >
                {busy === "generate" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShareLink}>
                <LinkIcon />
                공유 링크
              </Button>
              {report.shareToken && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/r/monthly/${report.shareToken}`} target="_blank" rel="noreferrer">
                    <Eye />
                    학부모 화면
                  </a>
                </Button>
              )}
              {!report.sentAt && (
                <Button size="sm" onClick={handleMarkSent} disabled={busy === "send"}>
                  {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />}
                  발송 표시
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!report ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-x6">
          <EmptyState
            icon={ClipboardList}
            title="아직 생성된 리포트가 없어요"
            description={`${year}년 ${month}월 출결·순공·멘토링 통계를 모아 리포트를 만들어요.`}
            action={
              <Button onClick={handleGenerate} disabled={busy === "generate"}>
                {busy === "generate" ? <Loader2 className="animate-spin" /> : <ClipboardList />}
                {busy === "generate" ? "생성 중…" : "리포트 생성"}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-x8 overflow-y-auto p-x5">
          {/* 통계 요약 */}
          <PaneSection title="통계">
            <div className="grid grid-cols-2 gap-x2 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="총 순공 시간" value={formatMinutes(report.totalStudyMinutes)}>
                {studyDiff !== null && studyDiff !== 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-x0_5 t2-medium",
                      studyDiff > 0 ? "text-fg-positive" : "text-fg-critical"
                    )}
                  >
                    {studyDiff > 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                    {studyDiff > 0 ? "+" : "-"}
                    {formatMinutes(Math.abs(studyDiff))}
                  </span>
                )}
                {studyDiff === 0 && (
                  <span className="inline-flex items-center gap-x0_5 t2-medium text-fg-neutral-subtle">
                    <Minus className="size-3" aria-hidden />
                    지난달과 같음
                  </span>
                )}
              </Stat>
              <Stat
                label="순위"
                value={report.studyRankInRoom ? `${report.studyRankInRoom}위` : "—"}
                sub={report.studyRankTotal ? `/ ${report.studyRankTotal}명` : ""}
              />
              <Stat label="출석" value={`${report.attendanceDays}일`} sub={`지각 ${report.tardyCount} · 결석 ${report.absentDays}`} />
              <Stat label="멘토링" value={`${report.mentoringCount}회`} />
              <Stat
                label="순찰 이상"
                value={`${report.patrolNoteCount + report.patrolAbsentCount}회`}
                sub={`특이 ${report.patrolNoteCount} · 자리비움 ${report.patrolAbsentCount}`}
              />
            </div>
            {report.patrolNotes && report.patrolNotes.length > 0 && (
              <ul className="mt-x2 flex flex-col gap-x1 rounded-r3 bg-bg-warning-weak px-x4 py-x3">
                {report.patrolNotes.map((n, i) => (
                  <li key={`${n.date}-${i}`} className="flex gap-x3 t3-regular text-fg-neutral">
                    <span className="w-10 shrink-0 t3-medium tabular-nums text-fg-warning-contrast">{n.date}</span>
                    <span className="flex-1 whitespace-pre-wrap">{n.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </PaneSection>

          {/* 모의고사 결과 (직전 → 당월, 어떤 시험인지 명시) */}
          <PaneSection title="모의고사 결과">
            {suppLoading && !supp ? (
              <PaneSkeleton />
            ) : !supp || supp.exams.length === 0 ? (
              <PaneEmpty>기록된 모의고사·내신 성적이 없어요</PaneEmpty>
            ) : (
              <ul className="flex flex-col gap-x2">
                {supp.exams.map((ex, i) => (
                  <li
                    key={`${ex.examDate}-${ex.examName}-${i}`}
                    className={cn(
                      "rounded-r3 border px-x4 py-x3",
                      ex.isThisMonth ? "border-stroke-brand-weak bg-bg-brand-weak" : "border-stroke-neutral-muted"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x1_5">
                      <StatusBadge tone="gray">{EXAM_TYPE_LABEL[ex.examType] ?? ex.examType}</StatusBadge>
                      <span className="t4-medium text-fg-neutral">{ex.examName}</span>
                      <span className="t2-regular tabular-nums text-fg-neutral-subtle">{ex.examDate}</span>
                      {ex.isThisMonth ? (
                        <StatusBadge tone="brand" className="ml-auto">당월</StatusBadge>
                      ) : i === lastExamIdx ? (
                        <StatusBadge tone="gray" className="ml-auto">직전</StatusBadge>
                      ) : null}
                    </div>
                    <div className="mt-x2 flex flex-wrap gap-x1_5">
                      {ex.subjects.map((sub, si) => (
                        <span
                          key={si}
                          className="inline-flex items-center gap-x1 rounded-r1_5 bg-bg-neutral-weak px-x2 py-x0_5 t2-regular tabular-nums"
                        >
                          <span className="text-fg-neutral-subtle">{sub.subject}</span>
                          <span className="t2-bold text-fg-neutral">
                            {sub.grade != null ? `${sub.grade}등급` : sub.rawScore != null ? `${sub.rawScore}점` : "—"}
                          </span>
                          {sub.percentile != null && <span className="text-fg-neutral-subtle">{sub.percentile}%</span>}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PaneSection>

          {/* 영단어 시험 결과 */}
          <PaneSection
            title="영단어 시험 결과"
            trailing={
              supp && supp.vocab.rows.length > 0 ? (
                <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                  {supp.vocab.rows.length}회 · 평균 <span className="t3-bold text-fg-neutral">{supp.vocab.avgScore}점</span>
                </span>
              ) : undefined
            }
          >
            {suppLoading && !supp ? (
              <PaneSkeleton />
            ) : !supp || supp.vocab.rows.length === 0 ? (
              <PaneEmpty>이 달 영단어 시험 결과가 없어요</PaneEmpty>
            ) : (
              <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
                <table className="w-full t3-regular tabular-nums">
                  <thead className="bg-bg-layer-fill">
                    <tr className="border-b border-stroke-neutral-muted">
                      <th className="px-x4 py-x2 text-left t3-medium text-fg-neutral-subtle">시험일</th>
                      <th className="px-x4 py-x2 text-right t3-medium text-fg-neutral-subtle">정답</th>
                      <th className="px-x4 py-x2 text-right t3-medium text-fg-neutral-subtle">점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke-neutral-muted">
                    {supp.vocab.rows.map((v) => (
                      <tr key={v.id}>
                        <td className="px-x4 py-x2 text-fg-neutral-muted">{v.testDate}</td>
                        <td className="px-x4 py-x2 text-right text-fg-neutral-muted">
                          {v.correctWords}/{v.totalWords}
                        </td>
                        <td className="px-x4 py-x2 text-right t3-bold text-fg-neutral">{v.score}점</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PaneSection>

          {/* 특이사항 · 상벌점 (체크된 항목만 학부모 리포트 노출) */}
          <PaneSection
            title="특이사항 · 상벌점"
            trailing={
              <span className="inline-flex items-center gap-x1 t2-regular text-fg-neutral-subtle">
                <Eye className="size-3.5" aria-hidden />
                켜진 항목만 학부모에게 보여요
              </span>
            }
          >
            {suppLoading && !supp ? (
              <PaneSkeleton />
            ) : (
              <div className="flex flex-col gap-x2">
                {/* 원생 기록 (MonthlyNote) */}
                {supp?.notes.monthlyNote ? (
                  <div
                    className={cn(
                      "flex items-start gap-x2 rounded-r3 border border-stroke-neutral-muted py-x2_5 pl-x4 pr-x2",
                      !supp.notes.monthlyNote.visibleInReport && "bg-bg-layer-fill"
                    )}
                  >
                    <p
                      className={cn(
                        "flex-1 whitespace-pre-wrap pt-x1 t3-regular",
                        supp.notes.monthlyNote.visibleInReport ? "text-fg-neutral" : "text-fg-neutral-subtle"
                      )}
                    >
                      {supp.notes.monthlyNote.content}
                    </p>
                    <VisibilityToggle
                      visible={supp.notes.monthlyNote.visibleInReport}
                      onToggle={(v) => toggleNoteVisible(supp.notes.monthlyNote!.id, v)}
                    />
                  </div>
                ) : (
                  <p className="t3-regular text-fg-neutral-subtle">이 달 원생 기록(특이사항)이 없어요</p>
                )}

                {/* 상벌점 (MeritDemerit) */}
                {supp && supp.notes.merits.length > 0 ? (
                  <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
                    {supp.notes.merits.map((m) => (
                      <li
                        key={m.id}
                        className={cn(
                          "flex items-center gap-x2 py-x1_5 pl-x4 pr-x2",
                          !m.visibleInReport && "bg-bg-layer-fill"
                        )}
                      >
                        <StatusBadge tone={m.type === "MERIT" ? "ok" : "bad"}>
                          {m.type === "MERIT" ? `상점 +${m.points}` : `벌점 -${m.points}`}
                        </StatusBadge>
                        <span
                          className={cn(
                            "flex-1 truncate t3-regular",
                            m.visibleInReport ? "text-fg-neutral" : "text-fg-neutral-subtle"
                          )}
                        >
                          {m.reason ?? m.category ?? "—"}
                        </span>
                        <span className="shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">{m.date}</span>
                        <VisibilityToggle visible={m.visibleInReport} onToggle={(v) => toggleMeritVisible(m.id, v)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t3-regular text-fg-neutral-subtle">이 달 상벌점이 없어요</p>
                )}
              </div>
            )}
          </PaneSection>

          {/* 멘토링 종합 의견 — 항상 편집 가능 */}
          <PaneSection
            title="멘토링 종합 의견"
            trailing={
              <div className="flex gap-x1_5">
                <Button variant="outline" size="xs" onClick={handleAutoExtract} disabled={busy === "extract"}>
                  {busy === "extract" && <Loader2 className="animate-spin" />}
                  자동 추출
                </Button>
                <Button variant="outline" size="xs" onClick={handleAiSummary} disabled={busy === "ai"}>
                  {busy === "ai" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  AI 요약
                </Button>
              </div>
            }
          >
            <MarkdownEditor value={summary} onChange={setSummary} placeholder="월간 종합 의견 — 자동 추출/AI 요약으로 초안 생성 가능" />
            <SaveRow dirty={summaryDirty}>
              <Button size="sm" onClick={handleSaveSummary} disabled={busy === "summary" || !summaryDirty}>
                {busy === "summary" ? <Loader2 className="animate-spin" /> : <Check />}
                의견 저장
              </Button>
            </SaveRow>
          </PaneSection>

          {/* 원장 한마디 — 항상 편집 가능 */}
          <PaneSection title="원장님 한마디" description="선택 사항이에요">
            <MarkdownEditor value={comment} onChange={setComment} placeholder="학부모에게 전할 메시지..." />
            <SaveRow dirty={commentDirty}>
              <Button size="sm" onClick={handleSaveComment} disabled={busy === "comment" || !commentDirty}>
                {busy === "comment" ? <Loader2 className="animate-spin" /> : <Check />}
                코멘트 저장
              </Button>
            </SaveRow>
          </PaneSection>

          {/* 첨부 사진 */}
          <PaneSection
            title="첨부 사진"
            trailing={
              <Button variant="outline" size="xs" onClick={() => setPhotoPickerOpen(true)}>
                <ImageIcon />
                사진 선택
              </Button>
            }
          >
            {report.attachedPhotoIds.length === 0 ? (
              <Notice tone="warn" icon={AlertCircle}>
                첨부된 사진이 없어요. &quot;사진 선택&quot;으로 이 달 사진을 골라 첨부하세요.
              </Notice>
            ) : (
              <p className="t3-regular text-fg-neutral-muted">
                사진 <span className="t3-bold tabular-nums text-fg-neutral">{report.attachedPhotoIds.length}장</span>이
                첨부돼 있어요. &quot;사진 선택&quot;으로 바꿀 수 있어요.
              </p>
            )}
          </PaneSection>

          {/* 발송 이력 */}
          {report.sentAt && (
            <p className="flex items-center gap-x1 t3-regular tabular-nums text-fg-neutral-subtle">
              <Clock className="size-3.5" aria-hidden />
              발송 기록 {new Date(report.sentAt).toLocaleString("ko-KR")}
            </p>
          )}
        </div>
      )}

      {photoPickerOpen && report && (
        <PhotoPickerDialog
          reportId={report.id}
          open={photoPickerOpen}
          onOpenChange={setPhotoPickerOpen}
          studentName={student.name}
        />
      )}
    </div>
  );
}

/** 디테일 패널 안 소구획 — 제목 + 우측 보조 요소 */
function PaneSection({
  title,
  description,
  trailing,
  children,
}: {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-x3 flex flex-wrap items-center justify-between gap-x2">
        <div className="flex items-baseline gap-x1_5">
          <h4 className="t5-bold text-fg-neutral">{title}</h4>
          {description && <span className="t3-regular text-fg-neutral-subtle">{description}</span>}
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function PaneEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-r3 bg-bg-layer-fill px-x4 py-x4 text-center t3-regular text-fg-neutral-subtle">{children}</p>
  );
}

function PaneSkeleton() {
  return (
    <div className="flex flex-col gap-x2" aria-label="불러오는 중">
      <Skeleton className="h-x12 w-full" />
      <Skeleton className="h-x12 w-2/3" />
    </div>
  );
}

/** 저장 버튼 줄 — 바뀐 내용이 있으면 안내 문구 */
function SaveRow({ dirty, children }: { dirty: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-x2 flex items-center justify-end gap-x2">
      {dirty && <span className="t3-medium text-fg-warning">바뀐 내용이 있어요 — 저장이 필요해요</span>}
      {children}
    </div>
  );
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: (v: boolean) => void }) {
  const label = visible ? "학부모 리포트에 노출 중 (누르면 숨김)" : "숨김 (누르면 노출)";
  return (
    <button
      type="button"
      onClick={() => onToggle(!visible)}
      title={label}
      aria-label={label}
      aria-pressed={visible}
      className={cn(
        "grid size-x8 shrink-0 place-items-center rounded-r2 transition-colors hover:bg-bg-transparent-pressed",
        visible ? "text-fg-positive" : "text-fg-placeholder",
      )}
    >
      {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
      <p className="t3-medium text-fg-neutral-subtle">{label}</p>
      <p className="mt-x1 flex flex-wrap items-baseline gap-x1">
        <span className="t6-bold tabular-nums text-fg-neutral">{value}</span>
        {sub && <span className="t2-regular tabular-nums text-fg-neutral-subtle">{sub}</span>}
      </p>
      {children && <div className="mt-x0_5">{children}</div>}
    </div>
  );
}
