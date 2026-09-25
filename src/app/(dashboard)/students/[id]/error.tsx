"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/backoffice/ui";

export default function StudentError({ error }: { error: Error & { digest?: string } }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title="페이지 로딩 오류"
      description={
        <>
          요청을 처리하는 중 문제가 발생했습니다.
          {error.digest && <span className="mt-x1 block t3-regular tabular-nums text-fg-placeholder">오류 코드 {error.digest}</span>}
        </>
      }
      action={
        <Button variant="outline" asChild>
          <Link href="/students">원생 목록으로 돌아가기</Link>
        </Button>
      }
    />
  );
}
