"use client";

import { useState, useTransition } from "react";
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
import { Loader2, Link as LinkIcon, Sparkles, Send, Pencil, Check, X, Eye } from "lucide-react";
import { toast } from "sonner";

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Report {
  id: string;
  studentId: string;
  year: number;
  month: number;
  student: Student;
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
  sentAt: Date | null;
}

interface Props {
  year: number;
  month: number;
  students: Student[];
  reports: Report[];
}

function formatMinutes(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  if (h < 1) return `${Math.round(minutes)}분`;
  return `${h}시간`;
}

export function MonthlyReportPanel({ year, month, students, reports }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [individualPending, setIndividualPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const reportMap = new Map(reports.map((r) => [r.studentId, r]));

  function toggleAll() {
    if (selected.size === students.length) setSelected(new Set());
    else setSelected(new Set(students.map((s) => s.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkGenerate() {
    if (selected.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    setBulkGenerating(true);
    let success = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        await generateMonthlyReport(id, year, month);
        success++;
      } catch {
        failed++;
      }
    }
    setBulkGenerating(false);
    setSelected(new Set());
    toast.success(`생성 완료: ${success}건${failed > 0 ? ` (실패 ${failed}건)` : ""}`);
    startTransition(() => router.refresh());
  }

  async function handleIndividualGenerate(studentId: string) {
    setIndividualPending(studentId);
    try {
      await generateMonthlyReport(studentId, year, month);
      toast.success("생성되었습니다");
      startTransition(() => router.refresh());
    } catch {
      toast.error("생성 실패");
    } finally {
      setIndividualPending(null);
    }
  }

  async function handleShareLink(report: Report) {
    try {
      const token = await ensureReportShareToken(report.id);
      const url = `${window.location.origin}/r/monthly/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("공유 링크가 클립보드에 복사되었습니다");
    } catch {
      toast.error("링크 생성 실패");
    }
  }

  async function handleMarkSent(id: string) {
    setIndividualPending(id);
    try {
      await markReportSent(id);
      toast.success("발송 처리되었습니다");
      startTransition(() => router.refresh());
    } catch {
      toast.error("처리 실패");
    } finally {
      setIndividualPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* 일괄 생성 바 */}
      <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={students.length > 0 && selected.size === students.length}
            onChange={toggleAll}
            className="rounded"
          />
          전체 선택
        </label>
        <span className="text-xs text-muted-foreground">{selected.size}명 선택됨</span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={bulkGenerating || selected.size === 0}
          onClick={handleBulkGenerate}
        >
          {bulkGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              생성 중...
            </>
          ) : (
            <>선택 학생 리포트 생성</>
          )}
        </Button>
      </div>

      {/* 학생별 테이블 */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 px-3 py-2"></th>
              <th className="text-left px-3 py-2 font-medium">학생</th>
              <th className="text-left px-3 py-2 font-medium w-24">순공시간</th>
              <th className="text-left px-3 py-2 font-medium w-20">출결</th>
              <th className="text-left px-3 py-2 font-medium w-16">멘토링</th>
              <th className="text-left px-3 py-2 font-medium w-16">상태</th>
              <th className="text-right px-3 py-2 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const report = reportMap.get(s.id);
              const isSelected = selected.has(s.id);
              const isPending = individualPending === s.id;
              return (
                <tr key={s.id} className={`border-b last:border-0 ${isSelected ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(s.id)} className="rounded" />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">{s.grade}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {report ? formatMinutes(report.totalStudyMinutes) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {report ? (
                      <span>
                        {report.attendanceDays}일
                        {report.tardyCount > 0 && <span className="text-amber-600 ml-1">지각{report.tardyCount}</span>}
                        {report.absentDays > 0 && <span className="text-red-600 ml-1">결석{report.absentDays}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {report ? `${report.mentoringCount}회` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {!report ? (
                      <Badge variant="outline" className="text-[10px]">
                        미생성
                      </Badge>
                    ) : report.sentAt ? (
                      <Badge className="text-[10px]">발송완료</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        생성됨
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!report ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isPending}
                          onClick={() => handleIndividualGenerate(s.id)}
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "생성"}
                        </Button>
                      ) : (
                        <ReportActions
                          report={report}
                          onShare={() => handleShareLink(report)}
                          onMarkSent={() => handleMarkSent(report.id)}
                          onRefresh={() => handleIndividualGenerate(s.id)}
                          pending={isPending}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportActions({
  report,
  onShare,
  onMarkSent,
  onRefresh,
  pending,
}: {
  report: Report;
  onShare: () => void;
  onMarkSent: () => void;
  onRefresh: () => void;
  pending: boolean;
}) {
  const router = useRouter();
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [summary, setSummary] = useState(report.mentoringSummary ?? "");
  const [comment, setComment] = useState(report.overallComment ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleAiSummary() {
    setBusy("ai");
    try {
      const generated = await generateMonthlyMentoringSummary(report.studentId, report.year, report.month);
      setSummary(generated);
      setEditingSummary(true);
      toast.success("AI 초안이 생성되었습니다. 검토 후 저장하세요");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoExtract() {
    setBusy("extract");
    try {
      const digest = await extractMonthlyMentoringDigest(report.studentId, report.year, report.month);
      setSummary(digest);
      setEditingSummary(true);
      toast.success("이번 달 멘토링 기록에서 자동 추출했습니다");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSummary() {
    setBusy("summary");
    try {
      await updateReportMentoringSummary(report.id, summary);
      toast.success("저장되었습니다");
      setEditingSummary(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveComment() {
    setBusy("comment");
    try {
      await updateReportComment(report.id, comment);
      toast.success("저장되었습니다");
      setEditingComment(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setDetailOpen(!detailOpen)}
      >
        <Pencil className="h-3 w-3 mr-1" />
        편집
      </Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onShare}>
        <LinkIcon className="h-3 w-3 mr-1" />
        링크
      </Button>
      {report.shareToken && (
        <a
          href={`/r/monthly/${report.shareToken}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3 w-3" />
        </a>
      )}
      {!report.sentAt && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-emerald-700"
          onClick={onMarkSent}
          disabled={pending}
        >
          <Send className="h-3 w-3 mr-1" />
          발송
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRefresh} disabled={pending}>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "재집계"}
      </Button>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 text-left" onClick={() => setDetailOpen(false)}>
          <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-semibold">{report.student.name} {report.year}년 {report.month}월 리포트</h3>
              <button onClick={() => setDetailOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* 멘토링 종합 의견 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">월간 멘토링 종합 의견</h4>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAutoExtract} disabled={busy === "extract"}>
                      {busy === "extract" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Pencil className="h-3 w-3 mr-1" />}
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
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[60px]">
                    {report.mentoringSummary || <span className="text-muted-foreground">작성된 내용이 없습니다</span>}
                  </div>
                )}
              </div>

              {/* 원장 코멘트 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">원장님 한마디 (선택)</h4>
                  {!editingComment && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingComment(true)}>
                      <Pencil className="h-3 w-3 mr-1" />
                      수정
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
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[60px]">
                    {report.overallComment || <span className="text-muted-foreground">작성된 내용이 없습니다</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
