"use client";

import { useParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/portal/ui";

export default function PortalNotFound() {
  const params = useParams<{ token: string }>();
  return (
    <EmptyState
      className="py-24"
      icon={SearchX}
      title="찾을 수 없는 화면이에요"
      description={"삭제되었거나 주소가 바뀌었을 수 있어요."}
      action={
        <ButtonLink href={params?.token ? `/s/${params.token}` : "/"} variant="gray" size="md">
          홈으로 가기
        </ButtonLink>
      }
    />
  );
}
