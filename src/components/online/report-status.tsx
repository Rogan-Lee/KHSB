// 학부모 보고서 상태 표기 — 목록(주간·월간)·상세·편집기가 같은 문구·색을 쓰도록 한곳에 둔다.
// 훅이 없어 서버/클라이언트 컴포넌트 양쪽에서 import 가능.

import type { ReactNode } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import type { OnlineReportStatus } from "@/generated/prisma";

export const REPORT_STATUS_LABEL: Record<OnlineReportStatus, string> = {
  QUEUED: "대기열",
  DRAFT: "초안",
  DRAFT_FAILED: "생성 실패",
  REVIEW: "편집 중",
  APPROVED: "승인 완료",
  SENT: "발송 완료",
};

// 초안·편집 중 = 원장 검토가 필요한 상태(brand/warn), 승인 = 발송 대기(info), 발송 = 완료(ok)
export const REPORT_STATUS_TONE: Record<OnlineReportStatus, Tone> = {
  QUEUED: "gray",
  DRAFT: "brand",
  DRAFT_FAILED: "bad",
  REVIEW: "warn",
  APPROVED: "info",
  SENT: "ok",
};

export function ReportStatusBadge({
  status,
  className,
}: {
  status: OnlineReportStatus;
  className?: string;
}) {
  return (
    <StatusBadge tone={REPORT_STATUS_TONE[status]} className={className}>
      {REPORT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

/** 발송 완료 보고서의 편집 잠금 안내 줄 — 잠금 해제(재편집)/취소 버튼 포함. 클라이언트 컴포넌트 안에서만 렌더 */
export function SentLockBar({
  unlocked,
  onUnlock,
  onCancel,
  className,
}: {
  unlocked: boolean;
  onUnlock: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const Icon = unlocked ? Unlock : Lock;
  const text: ReactNode = unlocked
    ? "재편집 중이에요. 저장하면 학부모 공개 페이지에 바로 반영돼요."
    : "발송 완료된 보고서라 편집이 잠겨 있어요.";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x3 gap-y-x2 rounded-r3 px-x4 py-x3",
        unlocked ? "bg-bg-warning-weak" : "bg-bg-positive-weak",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-x2 t4-medium text-fg-neutral">
        <Icon
          className={cn("size-4 shrink-0", unlocked ? "text-fg-warning" : "text-fg-positive")}
          aria-hidden
        />
        {text}
      </span>
      {unlocked ? (
        <Button type="button" variant="outline" size="xs" onClick={onCancel}>
          편집 취소
        </Button>
      ) : (
        <Button type="button" variant="outline" size="xs" onClick={onUnlock}>
          <Unlock />
          재편집
        </Button>
      )}
    </div>
  );
}
