import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StudentNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-lg font-semibold text-foreground">원생을 찾을 수 없습니다</p>
      <p className="text-sm text-muted-foreground">해당 원생이 삭제되었거나 존재하지 않습니다.</p>
      <Link href="/students">
        <Button variant="outline" size="sm">원생 목록으로 돌아가기</Button>
      </Link>
    </div>
  );
}
