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
import { StatusBadge } from "@/components/backoffice/ui";

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
        <Button variant="outline" size="sm">
          <Link2 />
          포털 링크 관리
          {missing > 0 && <StatusBadge tone="brand">미발급 {missing}</StatusBadge>}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>학생 포털 링크</SheetTitle>
          <SheetDescription>
            재원생 본인 전용 링크예요({issuedCount}/{rows.length}명 발급). 30일 뒤 만료되고 다시 발급할 수 있어요.
            {!canManage && " 발급·재발급은 원장 권한이 필요해요."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-x4">
          <PortalLinksPanel students={rows} canManage={canManage} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
