"use client";

// 안내 발송 결과 — 푸시가 닿지 않은 학부모(앱 미설치·알림 꺼짐)를 가려 보여 준다.
// 그런 학부모에게는 같은 문구를 복사해 카카오톡으로 직접 전달한다.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Notice } from "@/components/backoffice/ui";
import type { TuitionReminderResult } from "@/actions/tuition";
import { copyText } from "./shared";

export function ReminderResultDialog({
  results,
  requestedCount,
  noticeTextById,
  onClose,
}: {
  results: TuitionReminderResult[];
  /** 발송을 요청한 건수 — 결과 건수와 다르면 코어가 일부를 보내지 않은 것 (그 사이 납부·취소 등) */
  requestedCount: number;
  noticeTextById: Map<string, string | null>;
  onClose: () => void;
}) {
  const reached = results.filter((r) => r.sent > 0);
  const missed = results.filter((r) => r.sent === 0);
  const skipped = Math.max(0, requestedCount - results.length);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>안내 발송 결과</DialogTitle>
          <DialogDescription>
            <span className="tabular-nums">
              도달 {reached.length}명 · 미도달 {missed.length}명
            </span>
            {skipped > 0 && ` · 발송 제외 ${skipped}건`}
          </DialogDescription>
        </DialogHeader>

        {missed.length === 0 ? (
          <Notice tone="ok">선택한 학부모 모두에게 앱 알림이 전달됐어요.</Notice>
        ) : (
          <div className="flex flex-col gap-x3">
            <Notice tone="warn">
              아래 학부모는 앱을 설치하지 않았거나 알림을 꺼 두어 전달되지 않았어요. 안내문을 복사해 카카오톡으로
              직접 보내 주세요.
            </Notice>
            <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
              {missed.map((row) => {
                const text = noticeTextById.get(row.invoiceId) ?? null;
                return (
                  <li key={row.invoiceId} className="flex items-center justify-between gap-x3 px-x4 py-x2_5">
                    <span className="min-w-0 truncate t4-medium text-fg-neutral">{row.studentName}</span>
                    <KakaoButton
                      size="xs"
                      disabled={!text}
                      onClick={() => text && copyText(text, `${row.studentName} 학부모 안내문을 복사했어요`)}
                    >
                      안내문 복사
                    </KakaoButton>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
