"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createParentReport } from "@/actions/parent-reports";
import { Link2, Copy, Check, Send } from "lucide-react";

interface Props {
  mentoringId: string;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

export function ParentReportDialog({ mentoringId, studentName, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [studyPlanNote, setStudyPlanNote] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCreate() {
    startTransition(async () => {
      try {
        const images = imageUrls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        const { token } = await createParentReport(mentoringId, {
          studyPlanNote: studyPlanNote.trim() || undefined,
          studyPlanImages: images.length > 0 ? images : undefined,
          customNote: customNote.trim() || undefined,
        });
        const origin = window.location.origin;
        setReportUrl(`${origin}/r/${token}`);
      } catch {
        toast.error("리포트 생성에 실패했습니다");
      }
    });
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const smsText = reportUrl
    ? `[KHSB] ${studentName} 멘토링 리포트를 확인해 주세요.\n${reportUrl}`
    : "";

  function handleClose() {
    setStudyPlanNote("");
    setImageUrls("");
    setCustomNote("");
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
            학부모 리포트 생성
          </DialogTitle>
        </DialogHeader>

        {!reportUrl ? (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              멘토링 내용이 포함된 링크를 생성합니다. 추가 내용을 입력하거나 바로 생성하세요.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs">학부모 안내 메시지 (선택)</Label>
              <Textarea
                placeholder="학부모께 전달할 내용을 입력하세요..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">학습 계획 메모 (선택)</Label>
              <Textarea
                placeholder="오늘의 학습 계획이나 목표를 입력하세요..."
                value={studyPlanNote}
                onChange={(e) => setStudyPlanNote(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">학습 계획 이미지 URL (선택, 한 줄에 하나씩)</Label>
              <Textarea
                placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
                value={imageUrls}
                onChange={(e) => setImageUrls(e.target.value)}
                rows={2}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                이미지를 구글 포토, 카카오 등에 업로드 후 링크를 붙여넣으세요
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleCreate} disabled={isPending} className="flex-1">
                {isPending ? "생성 중..." : "링크 생성"}
              </Button>
              <Button variant="outline" onClick={handleClose}>취소</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-1.5 text-green-600">
              <Check className="h-4 w-4" />
              <p className="text-sm font-medium">리포트가 생성되었습니다</p>
            </div>

            {/* 리포트 URL */}
            <div className="space-y-1.5">
              <Label className="text-xs">리포트 링크</Label>
              <div className="flex gap-2">
                <Input
                  value={reportUrl}
                  readOnly
                  className="text-xs font-mono bg-muted"
                />
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

            {/* SMS 템플릿 */}
            <div className="space-y-1.5">
              <Label className="text-xs">문자 메시지 템플릿</Label>
              <div className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap text-muted-foreground font-mono text-xs leading-relaxed">
                {smsText}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => handleCopy(smsText)}
              >
                <Send className="h-3.5 w-3.5" />
                {copied ? "복사됨!" : "문자 내용 복사"}
              </Button>
            </div>

            <Button variant="outline" className="w-full" onClick={handleClose}>
              닫기
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
