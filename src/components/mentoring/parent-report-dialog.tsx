"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createParentReport } from "@/actions/parent-reports";
import {
  enhanceMentoringWithAI,
  type EnhancedMentoringContent,
} from "@/actions/ai-enhance";
import { Link2, Copy, Check, Send, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormActions, FormField, IconTile, Notice } from "@/components/backoffice/ui";

interface Props {
  mentoringId: string;
  studentName: string;
  mentoringDate?: string; // "4월 11일" 형식
  open: boolean;
  onClose: () => void;
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

export function ParentReportDialog({ mentoringId, studentName, mentoringDate, open, onClose }: Props) {
  const [, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("choose");
  const [edited, setEdited] = useState<EditableContent>({
    content: "", improvements: "", weaknesses: "", nextGoals: "", notes: "",
  });
  const [reportUrl, setReportUrl] = useState<string | null>(null);
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
        // AI 고도화 내용을 customNote에 저장 (원본 멘토링 데이터 보존)
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

  function handleClose() {
    setStep("choose");
    setEdited({ content: "", improvements: "", weaknesses: "", nextGoals: "", notes: "" });
    setReportUrl(null);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={cn("max-w-md", step === "review" && "w-[90vw] max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>학부모 리포트 생성</DialogTitle>
          {step === "choose" && (
            <DialogDescription>멘토링 기록으로 학부모 리포트 링크를 만들어요.</DialogDescription>
          )}
        </DialogHeader>

        {/* ── 1. 선택 ── */}
        {step === "choose" && (
          <div className="flex flex-col gap-x3">
            <button
              type="button"
              onClick={handleAIEnhance}
              className="flex w-full items-start gap-x3 rounded-r3 border border-stroke-brand-weak bg-bg-brand-weak p-x4 text-left transition-colors hover:bg-bg-brand-weak-pressed"
            >
              <IconTile icon={Sparkles} tone="brand" size={32} className="bg-bg-layer-default" />
              <div>
                <p className="t4-bold text-fg-brand">AI 전문 리포트 작성</p>
                <p className="mt-x0_5 t3-regular text-fg-neutral-muted">
                  입시 컨설턴트 문체로 다듬고 맞춤법을 고쳐요.
                  <br />
                  내용을 검토한 뒤 리포트를 만들 수 있어요.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleQuickCreate}
              className="flex w-full items-start gap-x3 rounded-r3 border border-stroke-neutral-muted p-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
            >
              <IconTile icon={ArrowRight} tone="gray" size={32} />
              <div>
                <p className="t4-bold text-fg-neutral">기존 내용으로 바로 생성</p>
                <p className="mt-x0_5 t3-regular text-fg-neutral-muted">작성된 멘토링 기록을 그대로 써요.</p>
              </div>
            </button>
          </div>
        )}

        {/* ── 2. AI 처리 중 ── */}
        {step === "enhancing" && (
          <div className="flex flex-col items-center justify-center gap-x3 py-x12" role="status">
            <Loader2 className="size-6 animate-spin text-fg-brand" aria-hidden />
            <div className="text-center">
              <p className="t4-bold text-fg-neutral">AI가 리포트를 쓰고 있어요</p>
              <p className="mt-x1 t3-regular text-fg-neutral-subtle">입시 컨설턴트 문체로 내용을 다듬는 중이에요…</p>
            </div>
          </div>
        )}

        {/* ── 3. 검토 & 편집 ── */}
        {step === "review" && (
          <div className="flex flex-col gap-x4">
            <Notice tone="info" icon={Sparkles}>AI가 내용을 다듬었어요. 직접 고친 뒤 리포트를 만드세요.</Notice>

            <div className="flex max-h-[65vh] flex-col gap-x4 overflow-y-auto pr-x1">
              {FIELD_LABELS.filter(({ key }) => edited[key]).map(({ key, label, rows }) => (
                <FormField key={key} label={label}>
                  <Textarea
                    value={edited[key]}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={rows + 1}
                    className="resize-y"
                  />
                </FormField>
              ))}
            </div>

            <FormActions>
              <Button variant="outline" onClick={() => setStep("choose")}>다시</Button>
              <Button onClick={handleCreateFromReview}>
                <Link2 />
                리포트 생성
              </Button>
            </FormActions>
          </div>
        )}

        {/* ── 4. 생성 중 ── */}
        {step === "creating" && (
          <div className="flex flex-col items-center justify-center gap-x3 py-x10" role="status">
            <Loader2 className="size-6 animate-spin text-fg-neutral-subtle" aria-hidden />
            <p className="t4-regular text-fg-neutral-muted">링크를 만드는 중이에요…</p>
          </div>
        )}

        {/* ── 5. 완료 ── */}
        {step === "done" && reportUrl && (
          <div className="flex flex-col gap-x4">
            <p className="flex items-center gap-x1_5 t4-bold text-fg-positive">
              <Check className="size-4" aria-hidden />
              리포트 링크를 만들었어요
            </p>

            <FormField label="리포트 링크">
              <div className="flex gap-x2">
                <Input value={reportUrl} readOnly className="t3-regular" aria-label="리포트 링크" />
                <Button variant="outline" size="icon" onClick={() => handleCopy(reportUrl)} aria-label="링크 복사">
                  {copied ? <Check className="text-fg-positive" /> : <Copy />}
                </Button>
              </div>
            </FormField>

            <div className="flex flex-col gap-x2">
              <p className="t4-medium text-fg-neutral">발송 메시지 미리보기</p>
              <div className="whitespace-pre-wrap rounded-r2 bg-bg-layer-fill p-x3 t3-regular text-fg-neutral-muted">
                {shareText}
              </div>
            </div>

            <div className="flex flex-col gap-x2">
              <KakaoButton size="lg" className="w-full" onClick={handleShare}>
                카카오톡으로 보내기
              </KakaoButton>
              <Button variant="outline" className="w-full" onClick={() => handleCopy(shareText)}>
                <Send />
                {copied ? "복사됨" : "메시지 복사 (문자용)"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleClose}>닫기</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
