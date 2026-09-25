import Link from "next/link";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/backoffice/ui";

export default function StudentNotFound() {
  return (
    <EmptyState
      icon={UserX}
      title="원생을 찾을 수 없습니다"
      description="해당 원생이 삭제되었거나 존재하지 않습니다."
      action={
        <Button variant="outline" asChild>
          <Link href="/students">원생 목록으로 돌아가기</Link>
        </Button>
      }
    />
  );
}
