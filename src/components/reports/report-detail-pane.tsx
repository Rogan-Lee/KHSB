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
} from "@/actions/reports";
import { generateMonthlyMentoringSummary } from "@/actions/ai-enhance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  Loader2, Link as LinkIcon, Sparkles, Send, Pencil, Check, Eye,
  Image as ImageIcon, RefreshCw, User as UserIcon, Clock, ClipboardList,
  TrendingUp, TrendingDown, Minus, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhotoPickerDialog } from "./photo-picker-dialog";

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
  const [editingSummary, setEditingSummary] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [summary, setSummary] = useState(report?.mentoringSummary ?? "");
  const [comment, setComment] = useState(report?.overallComment ?? "");
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  // 선택된 학생 바뀔 때 로컬 편집 상태 초기화
  useEffect(() => {
    setEditingSummary(false);
    setEditingComment(false);
    setSummary(report?.mentoringSummary ?? "");
    setComment(report?.overallComment ?? "");
  }, [report?.id, report?.mentoringSummary, report?.overallComment]);

  if (!student) {
    return (
      <div className="border rounded-lg flex items-center justify-center h-full min-h-[400px] text-sm text-muted-foreground">
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
      setEditingSummary(true);
      toast.success("멘토링 기록 자동 추출 완료 — 검토 후 저장");
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
      setEditingSummary(true);
      toast.success("AI 초안 생성 완료 — 검토 후 저장");
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
      setEditingSummary(false);
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
      setEditingComment(false);
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
    <div className="border rounded-lg bg-background flex flex-col min-h-[600px]">
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
        <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          아직 생성된 리포트가 없습니다. 상단 "리포트 생성" 버튼으로 집계를 실행하세요.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
            </div>
          </section>

          {/* 멘토링 종합 의견 */}
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
                {!editingSummary && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingSummary(true)}>
                    <Pencil className="h-3 w-3 mr-1" />
                    수정
                  </Button>
                )}
              </div>
            </div>
            {editingSummary ? (
              <div className="space-y-2">
                <MarkdownEditor value={summary} onChange={setSummary} placeholder="월간 종합 의견..." />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setSummary(report.mentoringSummary ?? ""); setEditingSummary(false); }} disabled={busy === "summary"}>
                    취소
                  </Button>
                  <Button size="sm" onClick={handleSaveSummary} disabled={busy === "summary"}>
                    {busy === "summary" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/20 p-3 text-sm min-h-[80px]">
                {report.mentoringSummary ? (
                  <MarkdownViewer source={report.mentoringSummary} />
                ) : (
                  <span className="text-muted-foreground">작성된 내용이 없습니다. 자동 추출 또는 AI 요약으로 초안을 만들 수 있어요.</span>
                )}
              </div>
            )}
          </section>

          {/* 원장 한마디 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">원장님 한마디 (선택)</h4>
              {!editingComment && (
                <Button variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={() => setEditingComment(true)}>
                  <Pencil className="h-3 w-3 mr-1" />수정
                </Button>
              )}
            </div>
            {editingComment ? (
              <div className="space-y-2">
                <MarkdownEditor value={comment} onChange={setComment} placeholder="학부모에게 전할 메시지..." />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setComment(report.overallComment ?? ""); setEditingComment(false); }} disabled={busy === "comment"}>
                    취소
                  </Button>
                  <Button size="sm" onClick={handleSaveComment} disabled={busy === "comment"}>
                    {busy === "comment" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/20 p-3 text-sm min-h-[60px]">
                {report.overallComment ? (
                  <MarkdownViewer source={report.overallComment} />
                ) : (
                  <span className="text-muted-foreground">작성된 내용이 없습니다</span>
                )}
              </div>
            )}
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
