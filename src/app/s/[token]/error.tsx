"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, EmptyState } from "@/components/portal/ui";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className="py-24"
      icon={TriangleAlert}
      tone="warn"
      title="잠시 문제가 생겼어요"
      description={"네트워크 상태를 확인하고 다시 시도해 주세요.\n계속되면 원장님께 알려 주세요."}
      action={
        <Button variant="gray" size="md" onClick={reset}>
          <RotateCw className="h-4 w-4" />
          다시 시도
        </Button>
      }
    />
  );
}
