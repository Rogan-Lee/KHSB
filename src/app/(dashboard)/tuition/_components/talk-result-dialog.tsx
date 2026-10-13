"use client";

// 알림톡 청구서 발송 결과 — 학생별로 보냈는지·다시 보냈는지·실패했는지(사유 포함)를 보여 준다.
// 실패한 청구서는 사유를 확인해 고친 뒤 다시 보내거나, 안내문·링크를 복사해 직접 전달한다.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Notice, StatusBadge } from "@/components/backoffice/ui";
import type { TuitionTalkResult } from "@/actions/tuition";

export function TalkResultDialog({
  results,
  requestedCount,
  onClose,
}: {
  results: TuitionTalkResult[];
  /** 발송을 요청한 건수 — 결과 건수와 다르면 일부가 처리되지 않은 것 */
  requestedCount: number;
  onClose: () => void;
}) {
  const sent = results.filter((r) => r.ok && !r.resent);
  const resent = results.filter((r) => r.ok && r.resent);
  const failed = results.filter((r) => !r.ok);
  const skipped = Math.max(0, requestedCount - results.length);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>알림톡 청구서 발송 결과</DialogTitle>
          <DialogDescription>
            <span className="tabular-nums">
              발송 {sent.length}명 · 재발송 {resent.length}명 · 실패 {failed.length}명
            </span>
            {skipped > 0 && ` · 처리되지 않음 ${skipped}건`}
          </DialogDescription>
        </DialogHeader>

        {failed.length === 0 ? (
          <Notice tone="ok">선택한 학부모 모두에게 알림톡 청구서를 보냈어요.</Notice>
        ) : (
          <Notice tone="warn">아래 학부모에게는 보내지 못했어요. 사유를 확인한 뒤 다시 시도하거나 직접 전달해 주세요.</Notice>
        )}

        <ul className="max-h-80 divide-y divide-stroke-neutral-muted overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
          {[...failed, ...resent, ...sent].map((row) => (
            <li key={row.invoiceId} className="flex items-start justify-between gap-x3 px-x4 py-x2_5">
              <span className="min-w-0">
                <span className="block truncate t4-medium text-fg-neutral">{row.studentName || "알 수 없음"}</span>
                {!row.ok && row.error && (
                  <span className="mt-x0_5 block t3-regular text-fg-critical">{row.error}</span>
                )}
              </span>
              <StatusBadge tone={row.ok ? (row.resent ? "info" : "ok") : "bad"}>
                {row.ok ? (row.resent ? "다시 보냄" : "보냄") : "실패"}
              </StatusBadge>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
