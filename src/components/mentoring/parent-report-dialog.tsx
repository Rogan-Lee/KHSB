"use client";

import { useState, useTransition, useRef } from "react";
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
import { Link2, Copy, Check, Send, Upload, X, ImageIcon, Globe, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  mentoringId: string;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

type ImageMode = "file" | "url";

type ImageItem =
  | { type: "file"; file: File; previewUrl: string }
  | { type: "url"; url: string };

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "업로드 실패");
  }
  const { url } = await res.json();
  return url as string;
}

export function ParentReportDialog({ mentoringId, studentName, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [imageMode, setImageMode] = useState<ImageMode>("file");
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newItems: ImageItem[] = files.map((file) => ({
      type: "file" as const,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImageItems((prev) => [...prev, ...newItems]);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setImageItems((prev) => {
      const item = prev[index];
      if (item.type === "file") URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleCreate() {
    startTransition(async () => {
      try {
        const uploadedUrls: string[] = [];
        for (const item of imageItems) {
          if (item.type === "file") {
            const url = await uploadFile(item.file);
            uploadedUrls.push(url);
          }
        }

        const manualUrls = urlInput
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);

        const { token } = await createParentReport(mentoringId, {
          studyPlanImages: [...uploadedUrls, ...manualUrls],
        });
        const origin = window.location.origin;
        setReportUrl(`${origin}/r/${token}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "리포트 생성에 실패했습니다");
      }
    });
  }

  async function handleShare(url: string) {
    const shareText = `안녕하세요, ${studentName} 학부모님.\n오늘 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${studentName} 멘토링 리포트`, text: shareText, url });
      } catch {
        // 사용자가 공유 취소
      }
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
    imageItems.forEach((item) => {
      if (item.type === "file") URL.revokeObjectURL(item.previewUrl);
    });
    setImageMode("file");
    setImageItems([]);
    setUrlInput("");
    setReportUrl(null);
    setCopied(false);
    onClose();
  }

  const shareText = reportUrl
    ? `안녕하세요, ${studentName} 학부모님.\n오늘 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${reportUrl}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            학부모 리포트 생성
          </DialogTitle>
        </DialogHeader>

        {!reportUrl ? (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              멘토링 기록의 내용이 자동으로 포함됩니다. 학습 계획 이미지를 추가할 수 있습니다.
            </p>

            {/* 학습 계획 이미지 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">학습 계획 이미지 (선택)</Label>
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setImageMode("file")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 transition-colors",
                      imageMode === "file"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Upload className="h-3 w-3" />
                    파일
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("url")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 transition-colors border-l",
                      imageMode === "url"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    URL
                  </button>
                </div>
              </div>

              {imageMode === "file" ? (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <ImageIcon className="h-4 w-4" />
                    이미지 선택 (복수 선택 가능)
                  </button>
                  {imageItems.filter((i) => i.type === "file").length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {imageItems.map((item, idx) =>
                        item.type === "file" ? (
                          <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Textarea
                    placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    구글 포토, 카카오 등에 업로드 후 링크를 붙여넣으세요 (한 줄에 하나)
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleCreate} disabled={isPending} className="flex-1">
                {isPending
                  ? imageItems.length > 0 ? "업로드 중..." : "생성 중..."
                  : "링크 생성"}
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

            {/* 링크 복사 */}
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

            {/* 발송 메시지 미리보기 */}
            <div className="space-y-1.5">
              <Label className="text-xs">발송 메시지 미리보기</Label>
              <div className="rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
                {shareText}
              </div>
            </div>

            {/* 카카오톡 공유 */}
            <Button
              className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
              onClick={() => handleShare(reportUrl!)}
            >
              <MessageCircle className="h-4 w-4" />
              카카오톡으로 보내기
            </Button>

            {/* 문자 복사 */}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
