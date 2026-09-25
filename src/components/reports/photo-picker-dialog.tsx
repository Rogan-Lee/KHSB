"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUp, CheckCircle2, ImageOff, Sparkles } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/backoffice/ui";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
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
  // 부모가 열 때만 마운트하므로 처음부터 로딩 상태로 시작한다
  const [loading, setLoading] = useState(open);
  const [confirm, confirmDialog] = useConfirmDialog();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPhotosForReportPeriod(reportId)
      .then(({ photos, selectedIds }) => {
        if (cancelled) return;
        setPhotos(photos);
        setSelected(selectedIds);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "사진 불러오기 실패"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  async function handleAutoAttach() {
    const ok = await confirm({
      title: "자동 첨부로 바꿀까요?",
      description: "지금 고른 사진 대신 이 달 최신 사진 3장이 첨부돼요.",
      confirmLabel: "자동 첨부",
    });
    if (!ok) return;
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
          <DialogTitle>사진 선택{studentName ? ` · ${studentName}` : ""}</DialogTitle>
          <DialogDescription>
            학부모 공유 페이지에 첨부할 사진을 골라요. 고른 순서대로 보이고, 이 학생의 이 달 사진만 나와요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x2">
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            <span className="t3-bold text-fg-brand">{selected.length}장</span> 선택 / 사용 가능 {photos.length}장
          </span>
          <div className="flex gap-x1_5 sm:ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected([])}
              disabled={pending || selected.length === 0}
            >
              전체 해제
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoAttach}
              disabled={pending || loading}
            >
              <Sparkles />
              자동 첨부 (최신 3장)
            </Button>
          </div>
        </div>

        <div className="max-h-[480px] overflow-y-auto rounded-r3 bg-bg-layer-fill p-x3">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x2" aria-label="사진 불러오는 중">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <EmptyState
              compact
              icon={ImageOff}
              title="이 달 업로드된 사진이 없어요"
              description="멘토링 기록에서 사진을 올리면 여기에 보여요."
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x2">
              {photos.map((p) => {
                const isChecked = selected.includes(p.id);
                const selectedIdx = isChecked ? selected.indexOf(p.id) + 1 : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={isChecked}
                    aria-label={`${p.fileName}${isChecked ? ` · ${selectedIdx}번째로 선택됨` : ""}`}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-r2 bg-bg-neutral-weak transition-shadow",
                      isChecked
                        ? "shadow-[0_0_0_2px_var(--seed-color-stroke-brand-solid)]"
                        : "hover:shadow-[0_0_0_1px_var(--seed-color-stroke-neutral-weak)]"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumbnailUrl ?? p.url}
                      alt={p.fileName}
                      loading="lazy"
                      className={cn("h-full w-full object-cover", isChecked && "opacity-90")}
                    />
                    {isChecked && (
                      <div className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-bg-brand-solid t2-bold tabular-nums text-palette-static-white">
                        {selectedIdx}
                      </div>
                    )}
                    {isChecked && selectedIdx! > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); moveUp(p.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); moveUp(p.id); } }}
                        className="absolute right-1.5 top-1.5 grid size-6 cursor-pointer place-items-center rounded-full bg-bg-layer-floating text-fg-neutral shadow-s1 hover:bg-bg-layer-floating-pressed"
                        title="순서 앞으로"
                        aria-label="순서 앞으로"
                      >
                        <ArrowUp className="size-3.5" />
                      </span>
                    )}
                    {p.parsedDate && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-r1 bg-bg-overlay px-x1 t1-medium tabular-nums text-palette-static-white">
                        {new Date(p.parsedDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            <CheckCircle2 />
            {pending ? "저장 중…" : `${selected.length}장 저장`}
          </Button>
        </DialogFooter>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
