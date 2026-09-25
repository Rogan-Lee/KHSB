"use client";

// 확인/짧은 작성용 바텀시트 — SEED BottomSheet 스니펫(src/seed-design/ui/bottom-sheet) 래퍼.
// 포털 전반에서 쓰던 open/title/description/footer API 를 그대로 유지한다.

import type { ReactNode } from "react";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "seed-design/ui/bottom-sheet";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** 하단 버튼 영역 (Button 들을 나란히) */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <BottomSheetRoot open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BottomSheetContent title={title} description={description} showHandle className={className}>
        {children != null && <BottomSheetBody>{children}</BottomSheetBody>}
        {footer != null && (
          <BottomSheetFooter>
            <div className="flex w-full gap-x2 [&>*]:min-w-0">{footer}</div>
          </BottomSheetFooter>
        )}
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
