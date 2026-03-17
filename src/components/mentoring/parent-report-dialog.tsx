"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createParentReport } from "@/actions/parent-reports";
import { Link2, Copy, Check, Send, MessageCircle, Loader2 } from "lucide-react";

interface Props {
  mentoringId: string;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

export function ParentReportDialog({ mentoringId, studentName, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 다이얼로그 열릴 때 바로 링크 생성
  useEffect(() => {
    if (!open) return;
    setReportUrl(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const { token } = await createParentReport(mentoringId, { studyPlanImages: [] });
        setReportUrl(`${window.location.origin}/r/${token}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "리포트 생성에 실패했습니다");
      }
    });
  }, [open, mentoringId]);

  const shareText = reportUrl
    ? `안녕하세요, ${studentName} 학부모님.\n오늘 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${reportUrl}`
    : "";

  async function handleShare() {
    if (!reportUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${studentName} 멘토링 리포트`, text: shareText });
      } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("메시지가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setReportUrl(null);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            학부모 리포트
          </DialogTitle>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">링크 생성 중...</p>
          </div>
        ) : reportUrl ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-1.5 text-green-600">
              <Check className="h-4 w-4" />
              <p className="text-sm font-medium">리포트 링크가 생성되었습니다</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">리포트 링크</Label>
              <div className="flex gap-2">
                <Input value={reportUrl} readOnly className="text-xs font-mono bg-muted" />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => handleCopy(reportUrl)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">발송 메시지 미리보기</Label>
              <div className="rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
                {shareText}
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
              onClick={handleShare}
            >
              <MessageCircle className="h-4 w-4" />
              카카오톡으로 보내기
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => handleCopy(shareText)}
            >
              <Send className="h-3.5 w-3.5" />
              {copied ? "복사됨!" : "메시지 복사 (문자용)"}
            </Button>

            <Button variant="outline" className="w-full" onClick={handleClose}>
              닫기
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
