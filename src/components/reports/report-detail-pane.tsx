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
import { Badge } from "@/components/ui/badge";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Loader2, Link as LinkIcon, Sparkles, Send, Check, Eye, EyeOff,
  Image as ImageIcon, RefreshCw, User as UserIcon, Clock, ClipboardList,
  TrendingUp, TrendingDown, Minus, AlertCircle, GraduationCap, BookOpen, Star,
} from "lucide-react";
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
      <div className="border rounded-lg flex items-center justify-center h-full min-h-0 text-sm text-muted-foreground">
        좌측에서 학생을 선택하세요.
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

  return (
    <div className="border rounded-lg bg-background flex flex-col h-full min-h-0 overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UserIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base truncate">{student.name}</h3>
            <span className="text-xs text-muted-foreground">{student.grade}</span>
            {report ? (
              report.sentAt ? (
                <Badge className="text-[10px]">발송완료</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">생성됨</Badge>
              )
            ) : (
              <Badge variant="outline" className="text-[10px]">미생성</Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{year}년 {month}월 리포트</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {!report ? (
            <Button size="sm" onClick={handleGenerate} disabled={busy === "generate"}>
              {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1" />}
              리포트 생성
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={busy === "generate"} title="통계 재집계">
                {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShareLink}>
                <LinkIcon className="h-3.5 w-3.5 mr-1" />공유 링크
              </Button>
              {report.shareToken && (
                <a href={`/r/monthly/${report.shareToken}`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <Eye className="h-3.5 w-3.5 mr-1" />학부모 화면
                  </Button>
                </a>
              )}
              {!report.sentAt && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleMarkSent} disabled={busy === "send"}>
                  <Send className="h-3.5 w-3.5 mr-1" />발송 표시
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!report ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          아직 생성된 리포트가 없습니다. 상단 "리포트 생성" 버튼으로 집계를 실행하세요.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* 통계 요약 */}
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">통계</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="총 순공 시간" value={formatMinutes(report.totalStudyMinutes)}>
                {studyDiff !== null && studyDiff !== 0 && (
                  <span className={cn("inline-flex items-center gap-0.5 text-[10px] ml-1", studyDiff > 0 ? "text-emerald-700" : "text-red-600")}>
                    {studyDiff > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {formatMinutes(Math.abs(studyDiff))}
                  </span>
                )}
                {studyDiff === 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground ml-1">
                    <Minus className="h-2.5 w-2.5" />동일
                  </span>
                )}
              </Stat>
              <Stat label="순위" value={report.studyRankInRoom ? `${report.studyRankInRoom}위` : "—"} sub={report.studyRankTotal ? `/ ${report.studyRankTotal}명` : ""} />
              <Stat label="출석" value={`${report.attendanceDays}일`} sub={`지각 ${report.tardyCount} · 결석 ${report.absentDays}`} />
              <Stat label="멘토링" value={`${report.mentoringCount}회`} />
              <Stat
                label="순찰 이상"
                value={`${report.patrolNoteCount + report.patrolAbsentCount}회`}
                sub={`특이 ${report.patrolNoteCount} · 자리비움 ${report.patrolAbsentCount}`}
              />
            </div>
            {report.patrolNotes && report.patrolNotes.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-md border border-amber-100 bg-amber-50/60 px-2.5 py-2">
                {report.patrolNotes.map((n, i) => (
                  <li key={`${n.date}-${i}`} className="flex gap-2 text-xs text-foreground/80">
                    <span className="shrink-0 pt-px font-mono tabular-nums text-amber-700">{n.date}</span>
                    <span className="flex-1 whitespace-pre-wrap">{n.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 모의고사 결과 (직전 → 당월, 어떤 시험인지 명시) */}
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> 모의고사 결과
            </h4>
            {suppLoading && !supp ? (
              <p className="text-xs text-muted-foreground">불러오는 중…</p>
            ) : !supp || supp.exams.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">기록된 모의고사/내신 성적이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {supp.exams.map((ex, i) => (
                  <div key={`${ex.examDate}-${ex.examName}-${i}`} className={cn("rounded-md border p-2.5", ex.isThisMonth && "border-primary/40 bg-primary/5")}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{EXAM_TYPE_LABEL[ex.examType] ?? ex.examType}</Badge>
                      <span className="text-sm font-medium">{ex.examName}</span>
                      <span className="text-[10px] text-muted-foreground">{ex.examDate}</span>
                      {ex.isThisMonth ? (
                        <Badge className="text-[9px] h-4 px-1 ml-auto">당월</Badge>
                      ) : i === supp.exams.findIndex((e) => !e.isThisMonth) ? (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-auto">직전</Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {ex.subjects.map((s, si) => (
                        <span key={si} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          <span className="text-muted-foreground">{s.subject}</span>
                          <span className="font-semibold">
                            {s.grade != null ? `${s.grade}등급` : s.rawScore != null ? `${s.rawScore}점` : "—"}
                          </span>
                          {s.percentile != null && <span className="text-muted-foreground">{s.percentile}%</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 영단어 시험 결과 */}
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> 영단어 시험 결과
            </h4>
            {suppLoading && !supp ? (
              <p className="text-xs text-muted-foreground">불러오는 중…</p>
            ) : !supp || supp.vocab.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">이 달 영단어 시험 결과가 없습니다.</p>
            ) : (
              <div className="rounded-md border divide-y">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 text-[11px] text-muted-foreground">
                  <span>총 {supp.vocab.rows.length}회</span>
                  <span>평균 {supp.vocab.avgScore}점</span>
                </div>
                {supp.vocab.rows.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">{v.testDate}</span>
                    <span>{v.correctWords}/{v.totalWords}</span>
                    <span className="font-semibold tabular-nums">{v.score}점</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 특이사항 · 상벌점 (체크된 항목만 학부모 리포트 노출) */}
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" /> 특이사항 · 상벌점
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-muted-foreground">눈 아이콘 = 학부모 노출</span>
            </h4>
            {suppLoading && !supp ? (
              <p className="text-xs text-muted-foreground">불러오는 중…</p>
            ) : (
              <div className="space-y-2">
                {/* 원생 기록 (MonthlyNote) */}
                {supp?.notes.monthlyNote ? (
                  <div className={cn("rounded-md border p-2.5", !supp.notes.monthlyNote.visibleInReport && "opacity-50")}>
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs whitespace-pre-wrap">{supp.notes.monthlyNote.content}</p>
                      <VisibilityToggle
                        visible={supp.notes.monthlyNote.visibleInReport}
                        onToggle={(v) => toggleNoteVisible(supp.notes.monthlyNote!.id, v)}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">이 달 원생 기록(특이사항) 없음</p>
                )}

                {/* 상벌점 (MeritDemerit) */}
                {supp && supp.notes.merits.length > 0 ? (
                  <div className="rounded-md border divide-y">
                    {supp.notes.merits.map((m) => (
                      <div key={m.id} className={cn("flex items-center gap-2 px-2.5 py-1.5", !m.visibleInReport && "opacity-50")}>
                        <Badge variant={m.type === "MERIT" ? "default" : "destructive"} className="text-[9px] h-4 px-1">
                          {m.type === "MERIT" ? `상점 +${m.points}` : `벌점 -${m.points}`}
                        </Badge>
                        <span className="flex-1 text-xs truncate">{m.reason ?? m.category ?? "—"}</span>
                        <span className="text-[10px] text-muted-foreground">{m.date}</span>
                        <VisibilityToggle visible={m.visibleInReport} onToggle={(v) => toggleMeritVisible(m.id, v)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">이 달 상벌점 없음</p>
                )}
              </div>
            )}
          </section>

          {/* 멘토링 종합 의견 — 항상 편집 가능 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">멘토링 종합 의견</h4>
              <div className="flex gap-1 ml-auto">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAutoExtract} disabled={busy === "extract"}>
                  {busy === "extract" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  자동 추출
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAiSummary} disabled={busy === "ai"}>
                  {busy === "ai" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  AI 요약
                </Button>
              </div>
            </div>
            <MarkdownEditor value={summary} onChange={setSummary} placeholder="월간 종합 의견 — 자동 추출/AI 요약으로 초안 생성 가능" />
            <div className="flex items-center justify-end gap-2 mt-1.5">
              {summary !== (report.mentoringSummary ?? "") && (
                <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
              )}
              <Button size="sm" onClick={handleSaveSummary} disabled={busy === "summary" || summary === (report.mentoringSummary ?? "")}>
                {busy === "summary" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                의견 저장
              </Button>
            </div>
          </section>

          {/* 원장 한마디 — 항상 편집 가능 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">원장님 한마디 (선택)</h4>
            </div>
            <MarkdownEditor value={comment} onChange={setComment} placeholder="학부모에게 전할 메시지..." />
            <div className="flex items-center justify-end gap-2 mt-1.5">
              {comment !== (report.overallComment ?? "") && (
                <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
              )}
              <Button size="sm" onClick={handleSaveComment} disabled={busy === "comment" || comment === (report.overallComment ?? "")}>
                {busy === "comment" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                코멘트 저장
              </Button>
            </div>
          </section>

          {/* 첨부 사진 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">첨부 사진</h4>
              <Button variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={() => setPhotoPickerOpen(true)}>
                <ImageIcon className="h-3 w-3 mr-1" />사진 선택
              </Button>
            </div>
            {report.attachedPhotoIds.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                첨부된 사진이 없습니다. 좌측 "사진 선택"으로 이 달 사진을 골라 첨부하세요.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                첨부된 사진 {report.attachedPhotoIds.length}장 — "사진 선택" 버튼으로 변경 가능
              </p>
            )}
          </section>

          {/* 발송 이력 */}
          {report.sentAt && (
            <section className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              발송 기록: {new Date(report.sentAt).toLocaleString("ko-KR")}
            </section>
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

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!visible)}
      title={visible ? "학부모 리포트에 노출 중 (클릭하면 숨김)" : "숨김 (클릭하면 노출)"}
      className={cn(
        "shrink-0 rounded p-1 transition-colors",
        visible ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground/50 hover:bg-muted",
      )}
    >
      {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    </button>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-base font-bold mt-0.5 flex items-baseline gap-1">
        {value}
        {sub && <span className="text-[11px] text-muted-foreground font-normal">{sub}</span>}
        {children}
      </p>
    </div>
  );
}
