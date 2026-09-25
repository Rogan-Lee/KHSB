"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GraduationCap } from "lucide-react";
import { Skeleton, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  applyGradePromotion,
  previewGradePromotion,
  type GradePromotionPreviewRow,
} from "@/actions/students";

const ACTION_LABEL = {
  change: "변경",
  keep: "유지",
  manual: "수동 확인",
} as const;

const ACTION_TONE: Record<keyof typeof ACTION_LABEL, Tone> = {
  change: "brand",
  keep: "gray",
  manual: "warn",
};

export function GradePromotionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<GradePromotionPreviewRow[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setRows(null);
    startTransition(async () => {
      try {
        const preview = await previewGradePromotion();
        setRows(preview);
        // 자동 변경 대상만 기본 선택 (manual/keep 제외)
        setChecked(new Set(preview.filter((r) => r.action === "change").map((r) => r.studentId)));
      } catch {
        toast.error("승급 미리보기를 불러오지 못했습니다");
        setOpen(false);
      }
    });
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    if (!rows) return;
    const changes = rows
      .filter((r) => checked.has(r.studentId) && r.after !== r.before)
      .map((r) => ({ studentId: r.studentId, after: r.after }));
    if (changes.length === 0) {
      toast.error("적용할 변경이 없습니다");
      return;
    }
    startTransition(async () => {
      try {
        const { updated } = await applyGradePromotion(changes);
        toast.success(`${updated}명의 학년을 승급했습니다`);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("학년 승급에 실패했습니다");
      }
    });
  }

  const manualCount = rows?.filter((r) => r.action === "manual").length ?? 0;

  const changeCount = rows?.filter((r) => r.action === "change").length ?? 0;
  const keepCount = rows?.filter((r) => r.action === "keep").length ?? 0;

  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        <GraduationCap />
        학년 일괄 승급
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !isPending && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>학년 일괄 승급 미리보기</DialogTitle>
            <DialogDescription>
              재원생의 학년을 한 번에 올려요. 체크된 원생만 적용돼요.
            </DialogDescription>
          </DialogHeader>
          {!rows ? (
            <div className="flex flex-col gap-x2" aria-busy="true" aria-label="불러오는 중">
              <Skeleton className="h-5 w-56" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-x3">
              <div className="flex flex-wrap items-center gap-x1_5 t3-regular text-fg-neutral-muted">
                <span className="tabular-nums">재원생 {rows.length}명</span>
                <StatusBadge tone="brand">변경 {changeCount}</StatusBadge>
                <StatusBadge>유지 {keepCount}</StatusBadge>
                {manualCount > 0 && <StatusBadge tone="warn">수동 확인 {manualCount}</StatusBadge>}
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"><span className="sr-only">선택</span></TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead>현재</TableHead>
                      <TableHead>변경 후</TableHead>
                      <TableHead>구분</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.studentId}
                        className={cn(r.action === "manual" && "bg-bg-warning-weak hover:bg-bg-warning-weak-pressed")}
                      >
                        <TableCell>
                          {r.action === "change" && (
                            <Checkbox
                              checked={checked.has(r.studentId)}
                              onCheckedChange={() => toggle(r.studentId)}
                              aria-label={`${r.name} 승급 선택`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap t4-medium">{r.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-fg-neutral-muted">{r.before || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap t4-medium">
                          {r.action === "change" ? r.after : <span className="text-fg-placeholder">-</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {manualCount > 0 && (
                <p className="t3-regular text-fg-warning">
                  수동 확인 항목은 승급 대상에서 제외됩니다. 학생 정보에서 개별 수정하세요.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button onClick={handleApply} disabled={isPending || !rows || checked.size === 0}>
              {isPending ? "처리 중…" : `${checked.size}명 승급 적용`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
