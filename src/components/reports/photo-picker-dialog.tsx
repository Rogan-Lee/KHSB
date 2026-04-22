"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, ImageOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getPhotosForReportPeriod, setReportPhotos, autoAttachPhotosToReport } from "@/actions/reports";

type PhotoItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  fileName: string;
  parsedDate: Date | null;
};

export function PhotoPickerDialog({
  reportId,
  open,
  onOpenChange,
  studentName,
}: {
  reportId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPhotosForReportPeriod(reportId)
      .then(({ photos, selectedIds }) => {
        setPhotos(photos);
        setSelected(selectedIds);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "사진 불러오기 실패"))
      .finally(() => setLoading(false));
  }, [open, reportId]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function moveUp(id: string) {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await setReportPhotos(reportId, selected);
        toast.success(`사진 ${selected.length}장 저장`);
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function handleAutoAttach() {
    if (!confirm("자동 첨부(해당 월 최신 3장)로 교체할까요?")) return;
    startTransition(async () => {
      try {
        await autoAttachPhotosToReport(reportId, 3);
        toast.success("자동 첨부 완료");
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "자동 첨부 실패");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>사진 선택{studentName ? ` — ${studentName}` : ""}</DialogTitle>
          <DialogDescription>
            학부모 공유 페이지에 첨부할 사진을 선택하세요. 선택한 순서대로 표시됩니다.
            해당 학생의 이 달 업로드 사진만 보입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            선택됨 {selected.length}장 / 사용 가능 {photos.length}장
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoAttach}
            disabled={pending || loading}
            className="ml-auto"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            자동 첨부(최신 3장)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected([])}
            disabled={pending || selected.length === 0}
          >
            전체 해제
          </Button>
        </div>

        <div className="max-h-[480px] overflow-y-auto border rounded-md p-3 bg-muted/10">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : photos.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <ImageOff className="h-10 w-10 opacity-30" />
              이 달 업로드된 사진이 없습니다.
              <span className="text-[11px]">
                사진 관리(/photos) 에서 <code className="bg-muted px-1 rounded">YYYYMMDD_좌석_이름.jpg</code> 규칙으로 업로드
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
              {photos.map((p) => {
                const isChecked = selected.includes(p.id);
                const selectedIdx = isChecked ? selected.indexOf(p.id) + 1 : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "relative aspect-square rounded-md overflow-hidden border bg-muted transition-all",
                      isChecked
                        ? "ring-2 ring-primary border-primary"
                        : "hover:ring-1 hover:ring-border"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumbnailUrl ?? p.url}
                      alt={p.fileName}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {isChecked && (
                      <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {selectedIdx}
                      </div>
                    )}
                    {isChecked && selectedIdx! > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); moveUp(p.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); moveUp(p.id); } }}
                        className="absolute top-1 right-1 bg-white text-ink-3 rounded p-0.5 text-[10px] shadow-sm hover:bg-muted cursor-pointer"
                        title="순서 앞으로"
                      >
                        ↑
                      </span>
                    )}
                    {p.parsedDate && (
                      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-white px-1.5 py-1 text-[10px] text-right">
                        {new Date(p.parsedDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {pending ? "저장 중…" : `${selected.length}장 저장`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
