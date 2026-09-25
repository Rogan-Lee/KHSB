import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewFeatureRequestForm } from "@/components/feature-requests/new-feature-request-form";
import { PageHeader } from "@/components/backoffice/ui";

export default async function NewRequestPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/requests", label: "요청 목록" }}
        title="요청 등록"
        description="필요한 기능이나 문제를 설명과 스크린샷으로 구체적으로 알려 주세요."
      />
      <NewFeatureRequestForm />
    </div>
  );
}
