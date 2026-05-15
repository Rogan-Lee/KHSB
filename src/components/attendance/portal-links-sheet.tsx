"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PortalLinksPanel, type PortalLinkRow } from "@/components/students/portal-links-panel";

/**
 * /attendance 헤더에 노출되는 「포털 링크 관리」 버튼 + 슬라이드 패널.
 * 패널 자체는 /students 「포털 링크」 탭과 동일한 컴포넌트(PortalLinksPanel) 재사용.
 */
export function PortalLinksSheet({
  rows,
  canManage,
}: {
  rows: PortalLinkRow[];
  canManage: boolean;
}) {
  const issuedCount = rows.filter((r) => r.token).length;
  const missing = rows.length - issuedCount;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="compact" className="gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          포털 링크 관리
          {missing > 0 && (
            <span className="ml-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
              미발급 {missing}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-brand" />
            학생 포털 링크
          </SheetTitle>
          <SheetDescription>
            재원생 본인 전용 링크({issuedCount}/{rows.length}명 발급됨). 30일 후 만료, 재발급 가능.
            {!canManage && " (발급·재발급은 원장 권한 필요)"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <PortalLinksPanel students={rows} canManage={canManage} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
