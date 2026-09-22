"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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

  return (
    <>
      <Button variant="outline" size="compact" onClick={openDialog}>
        <GraduationCap className="h-3.5 w-3.5" />
        학년 일괄 승급
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !isPending && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>학년 일괄 승급 미리보기</DialogTitle>
          </DialogHeader>
          {!rows ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                재원생 {rows.length}명 · 변경 {rows.filter((r) => r.action === "change").length}명
                · 유지 {rows.filter((r) => r.action === "keep").length}명
                {manualCount > 0 && (
                  <span className="text-amber-600"> · 수동 확인 {manualCount}명</span>
                )}
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
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
                        className={r.action === "manual" ? "bg-amber-50 hover:bg-amber-100/70" : undefined}
                      >
                        <TableCell>
                          {r.action === "change" && (
                            <Checkbox
                              checked={checked.has(r.studentId)}
                              onCheckedChange={() => toggle(r.studentId)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.before || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.action === "change" ? r.after : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-xs whitespace-nowrap ${
                            r.action === "manual" ? "font-medium text-amber-700" : "text-muted-foreground"
                          }`}
                        >
                          {ACTION_LABEL[r.action]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {manualCount > 0 && (
                <p className="text-xs text-amber-600">
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
              {isPending ? "처리 중..." : `${checked.size}명 승급 적용`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
