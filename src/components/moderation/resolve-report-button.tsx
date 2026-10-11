"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { resolveReport } from "@/actions/safety";
import type { ReportResolution } from "@/lib/safety";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import { FormField, Notice } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NOTE_MAX_LEN = 1000;

// 라벨은 @/lib/safety(서버 전용 의존)에 있어 서버 쪽에서 만들어 넘겨받는다
export type ResolutionOption = { value: ReportResolution; label: string; hint: string };

/** 처리 대기 신고의 "처리" 버튼 + 처리 결과·메모를 받는 다이얼로그 */
export function ResolveReportButton({
  reportId,
  summary,
  options,
}: {
  reportId: string;
  /** 다이얼로그 위쪽에 보여 줄 신고 요약 */
  summary: string;
  /** "글 삭제"는 신고된 글이 있을 때만 들어 있다 */
  options: ResolutionOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<ReportResolution | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const removing = resolution === "REMOVED";

  function openDialog() {
    setResolution(null);
    setNote("");
    setOpen(true);
  }

  function submit() {
    if (!resolution) return toast.error("처리 결과를 골라 주세요");
    startTransition(async () => {
      try {
        const res = await resolveReport({ reportId, resolution, note: note.trim() || undefined });
        if (res.ok) {
          toast.success(removing ? "글을 삭제하고 신고를 처리했어요" : "신고를 처리했어요");
          setOpen(false);
        } else {
          toast.error(res.error);
        }
        // 실패여도 새로 고친다 — 다른 사람이 먼저 처리한 신고면 목록에서 빠진다
        router.refresh();
      } catch {
        toast.error("처리에 실패했어요. 잠시 뒤 다시 시도해 주세요");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={openDialog} className="w-full sm:w-auto">
        처리
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="신고 처리"
        description="처리 결과를 남기면 이 신고가 처리 완료로 넘어가요."
        confirmLabel={removing ? "글 삭제하고 처리" : "처리 완료"}
        destructive={removing}
        pending={pending}
        onConfirm={submit}
      >
        <p className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 t4-regular text-fg-neutral-muted">{summary}</p>

        <FormField label="처리 결과" required>
          <div role="radiogroup" aria-label="처리 결과" className="flex flex-col gap-x2">
            {options.map((o) => {
              const selected = resolution === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={pending}
                  onClick={() => setResolution(o.value)}
                  className={cn(
                    "w-full rounded-r3 px-x3 py-x3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
                    selected
                      ? "bg-bg-layer-fill shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]"
                      : "bg-bg-layer-default shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)] hover:bg-bg-layer-default-pressed",
                  )}
                >
                  <span className="block t4-bold text-fg-neutral">{o.label}</span>
                  <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">{o.hint}</span>
                </button>
              );
            })}
          </div>
        </FormField>

        {removing && (
          <Notice tone="bad" icon={TriangleAlert} title="글이 완전히 삭제돼요">
            신고자와 상대방 양쪽 대화에서 모두 사라지고 되돌릴 수 없어요. 같은 글에 들어온 다른 신고도 함께 처리돼요.
          </Notice>
        )}

        <FormField label="메모" htmlFor={`resolve-note-${reportId}`} hint="선택 · 어떤 조치를 했는지 남겨 두면 나중에 확인하기 좋아요.">
          <Textarea
            id={`resolve-note-${reportId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={NOTE_MAX_LEN}
            placeholder="예: 당사자와 통화 후 주의 조치"
            disabled={pending}
          />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
