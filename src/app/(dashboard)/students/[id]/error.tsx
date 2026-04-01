"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StudentError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-lg font-semibold text-foreground">페이지 로딩 오류</p>
      <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
        요청을 처리하는 중 문제가 발생했습니다. {error.digest && `(${error.digest})`}
      </p>
      <Link href="/students">
        <Button variant="outline" size="sm">원생 목록으로 돌아가기</Button>
      </Link>
    </div>
  );
}
