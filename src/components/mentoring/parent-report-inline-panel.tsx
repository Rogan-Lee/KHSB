"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createParentReport } from "@/actions/parent-reports";
import {
  enhanceMentoringWithAI,
  type EnhancedMentoringContent,
} from "@/actions/ai-enhance";
import {
  Link2, Copy, Check, Send, MessageCircle,
  Loader2, Sparkles, ArrowRight, ExternalLink, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  mentoringId: string;
  studentName: string;
  mentoringDate?: string;
  /** 이미 생성된 리포트의 token (재발송 UX를 위해) */
  existingToken?: string | null;
  /** 패널 닫기 (부모에서 관리) */
  onClose?: () => void;
}

type Step = "choose" | "enhancing" | "review" | "creating" | "done";

interface EditableContent {
  content: string;
  improvements: string;
  weaknesses: string;
  nextGoals: string;
  notes: string;
}

const FIELD_LABELS: { key: keyof EditableContent; label: string; rows: number }[] = [
  { key: "content", label: "오늘 멘토링 내용", rows: 4 },
  { key: "improvements", label: "개선된 점", rows: 3 },
  { key: "weaknesses", label: "보완할 점", rows: 3 },
  { key: "nextGoals", label: "다음 멘토링 목표", rows: 3 },
  { key: "notes", label: "기타 메모", rows: 2 },
];

export function ParentReportInlinePanel({
  mentoringId,
  studentName,
  mentoringDate,
  existingToken,
  onClose,
}: Props) {
  const [, startTransition] = useTransition();
  const [step, setStep] = useState<Step>(existingToken ? "done" : "choose");
  const [edited, setEdited] = useState<EditableContent>({
    content: "", improvements: "", weaknesses: "", nextGoals: "", notes: "",
  });
  const [reportUrl, setReportUrl] = useState<string | null>(
    existingToken && typeof window !== "undefined"
      ? `${window.location.origin}/r/${existingToken}`
      : null
  );
  const [copied, setCopied] = useState(false);

  function nullToEmpty(v: string | null | undefined) { return v ?? ""; }

  function applyEnhanced(data: EnhancedMentoringContent) {
    setEdited({
      content: nullToEmpty(data.content),
      improvements: nullToEmpty(data.improvements),
      weaknesses: nullToEmpty(data.weaknesses),
      nextGoals: nullToEmpty(data.nextGoals),
      notes: nullToEmpty(data.notes),
    });
  }

  function handleAIEnhance() {
    setStep("enhancing");
    startTransition(async () => {
      try {
        const result = await enhanceMentoringWithAI(mentoringId);
        applyEnhanced(result);
        setStep("review");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI 처리에 실패했습니다");
        setStep("choose");
      }
    });
  }

  function handleQuickCreate() {
    setStep("creating");
    startTransition(async () => {
      try {
        const { token } = await createParentReport(mentoringId, { studyPlanImages: [] });
        setReportUrl(`${window.location.origin}/r/${token}`);
        setStep("done");
        toast.success("리포트 링크 생성 완료");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "리포트 생성에 실패했습니다");
        setStep("choose");
      }
    });
  }

  function handleCreateFromReview() {
    setStep("creating");
    startTransition(async () => {
      try {
        const enhancedNote = [
          edited.content && `[오늘 멘토링 내용]\n${edited.content}`,
          edited.improvements && `[개선된 점]\n${edited.improvements}`,
          edited.weaknesses && `[보완할 점]\n${edited.weaknesses}`,
          edited.nextGoals && `[다음 멘토링 목표]\n${edited.nextGoals}`,
          edited.notes && `[기타 메모]\n${edited.notes}`,
        ].filter(Boolean).join("\n\n");
        const { token } = await createParentReport(mentoringId, {
          studyPlanImages: [],
          customNote: enhancedNote || undefined,
        });
        setReportUrl(`${window.location.origin}/r/${token}`);
        setStep("done");
        toast.success("리포트 링크 생성 완료");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "리포트 생성에 실패했습니다");
        setStep("review");
      }
    });
  }

  const dateLabel = mentoringDate || "오늘";
  const shareText = reportUrl
    ? `안녕하세요, ${studentName} 학부모님.\n${dateLabel} 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${reportUrl}`
    : "";

  async function handleShare() {
    if (!reportUrl) return;
    if (navigator.share) {
      try { await navigator.share({ title: `${studentName} 멘토링 리포트`, text: shareText }); } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("메시지가 복사되었습니다.");
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRegenerate() {
    setStep("choose");
    setReportUrl(null);
    setEdited({ content: "", improvements: "", weaknesses: "", nextGoals: "", notes: "" });
  }

  return (
    <div className="border rounded-lg bg-background overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/40 flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">{studentName} · {dateLabel} · 학부모 리포트</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4">
        {/* ── 1. 선택 (생성 안 된 상태) ── */}
        {step === "choose" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleAIEnhance}
              className="flex items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 p-4 text-left transition-colors group"
            >
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-primary">AI 전문 리포트 작성</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  입시 컨설턴트 문체로 다듬고 맞춤법 교정. 검토 후 생성.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleQuickCreate}
              className="flex items-center gap-3 rounded-xl border hover:bg-accent p-4 text-left transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm">기존 내용으로 즉시 생성</p>
                <p className="text-xs text-muted-foreground mt-0.5">작성된 멘토링 기록 그대로 사용.</p>
              </div>
            </button>
          </div>
        )}

        {/* ── 2. AI 처리 중 ── */}
        {step === "enhancing" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <Loader2 className="absolute -top-1 -right-1 h-4 w-4 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">AI가 리포트를 작성 중입니다</p>
              <p className="text-xs mt-1">입시 컨설턴트 문체로 다듬고 있어요...</p>
            </div>
          </div>
        )}

        {/* ── 3. 검토 & 편집 ── */}
        {step === "review" && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-primary">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-medium">AI가 내용을 다듬었습니다. 검토·수정 후 생성하세요.</p>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {FIELD_LABELS.filter(({ key }) => edited[key]).map(({ key, label, rows }) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-0.5">{label}</p>
                  <Textarea
                    value={edited[key]}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={rows + 1}
                    className="resize-y text-sm leading-relaxed"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleCreateFromReview} className="flex-1 gap-1.5">
                <Link2 className="h-4 w-4" />
                리포트 생성
              </Button>
              <Button variant="outline" onClick={() => setStep("choose")}>다시</Button>
            </div>
          </div>
        )}

        {/* ── 4. 생성 중 ── */}
        {step === "creating" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">링크 생성 중...</p>
          </div>
        )}

        {/* ── 5. 완료 ── */}
        {step === "done" && reportUrl && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <Check className="h-4 w-4" />
                <p className="text-sm font-medium">리포트 링크가 준비되었습니다</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">리포트 링크</Label>
                <div className="flex gap-2">
                  <Input value={reportUrl} readOnly className="text-xs font-mono bg-muted" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => handleCopy(reportUrl)}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <a href={reportUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="icon" title="학부모 화면 열기">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">발송 메시지 미리보기</Label>
                <div className="rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {shareText}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 min-w-[180px]">
              <Button
                className="gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold w-full"
                onClick={handleShare}
              >
                <MessageCircle className="h-4 w-4" />
                카카오톡으로 보내기
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => handleCopy(shareText)}>
                <Send className="h-3.5 w-3.5" />
                {copied ? "복사됨!" : "메시지 복사"}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 w-full text-muted-foreground" onClick={handleRegenerate}>
                다시 생성
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
